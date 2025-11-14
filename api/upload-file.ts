import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import mammoth from 'mammoth';
// Import Tesseract dynamically inside the OCR branch to avoid module-load failures
import { randomUUID } from 'crypto';
import { ocrWithGptVision } from '../lib/vision';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';

function guessMimeFromFilename(filename: string) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function parseMultipart(req: VercelRequest): Promise<{ fileBuffer: Buffer; filename: string; mimeType: string; docId?: string }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as any });

    let fileBuffer: Buffer | null = null;
    let filename = '';
    let mimeType = '';
    let docId: string | undefined;

    busboy.on('file', (_fieldname, file, info) => {
      filename = info.filename;
      mimeType = info.mimeType || info.mime || '';

      const chunks: Buffer[] = [];
      file.on('data', (d: Buffer) => {
        chunks.push(d);
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('field', (fieldname, val) => {
      if (fieldname === 'docId') {
        docId = val;
      }
    });

    busboy.on('error', (err) => reject(err));

    busboy.on('finish', () => {
      if (!fileBuffer || !filename) {
        return reject(new Error('No file uploaded'));
      }
      resolve({ fileBuffer, filename, mimeType, docId });
    });

    req.pipe(busboy as any);
  });
}

async function extractTextFromFile(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || '';
  }

  // Image OCR support for common image types
  if (mimeType.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|bmp|tiff?)$/)) {
    // If configured, prefer GPT Vision (OpenAI Responses) for OCR
    if (process.env.USE_GPT_VISION === '1') {
      try {
        return await ocrWithGptVision(fileBuffer, mimeType);
      } catch (err: any) {
        const emsg = String(err?.message ?? err ?? '');
        console.error('GPT Vision OCR error', emsg);
        // If model is not available, fall back to tesseract if possible.
        if (emsg.toLowerCase().includes('model_not_found') || emsg.toLowerCase().includes('does not exist')) {
          console.warn('GPT Vision model not found; attempting local Tesseract fallback');
          // fall through to tesseract block below
        } else {
          throw new Error(emsg || 'Failed to perform OCR with GPT Vision');
        }
      }
    }

    try {
      // dynamic import so function can still load if dependency is missing
      const tesseract = await import('tesseract.js').catch((e) => {
        console.error('tesseract.js import failed', e);
        throw new Error('OCR dependency missing (tesseract.js). Run `npm install tesseract.js` or enable GPT Vision by setting USE_GPT_VISION=1.');
      });

      const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
      if (!createWorker) {
        console.error('createWorker function not found on tesseract module', Object.keys(tesseract));
        throw new Error('Incompatible tesseract.js export.');
      }

      const worker = createWorker();
      await worker.load();
      // loadLanguage/initialize can be slow; keep English by default
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data } = await worker.recognize(fileBuffer);
      await worker.terminate();
      return data?.text || '';
    } catch (err: any) {
      console.error('OCR error', err?.message ?? err);
      // surface a clear message to the client while keeping the original error in logs
      throw new Error(err?.message || 'Failed to perform OCR on image');
    }
  }

  throw new Error('Unsupported file type. Please upload a DOCX or image file.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Support two upload modes:
    // 1) multipart/form-data (handled by Busboy)
    // 2) JSON body with { fileBase64, filename, mimeType, docId }
    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;
    let providedDocId: string | undefined;

    const contentType = (req.headers['content-type'] || '') as string;
    if (contentType.includes('application/json')) {
      const body = req.body ?? {};
      const fileBase64 = body.fileBase64 || body.file || body.data;
      if (!fileBase64) {
        return res.status(400).json({ error: 'Missing fileBase64 in JSON body' });
      }
      fileBuffer = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
      filename = body.filename || 'upload.bin';
      mimeType = body.mimeType || 'application/octet-stream';
      providedDocId = body.docId;
    } else {
      const parsed = await parseMultipart(req);
      fileBuffer = parsed.fileBuffer;
      filename = parsed.filename;
      // prefer declared mimeType from parser, but fall back to guessing from filename
      mimeType = parsed.mimeType || guessMimeFromFilename(filename) || 'application/octet-stream';
      providedDocId = parsed.docId;
    }

    const docId = providedDocId || randomUUID();

    const text = await extractTextFromFile(fileBuffer, filename, mimeType);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text could be extracted from the file.' });
    }

    const chunks = chunkText(text);

    const rows = [] as { doc_id: string; text: string; embedding: number[] }[];

    for (const chunk of chunks) {
      const embedding = await embedText(chunk);
      rows.push({ doc_id: docId, text: chunk, embedding: embedding as any });
    }

    const { error } = await supabase.from('chunks').insert(rows as any);
    if (error) {
      console.error('upload-file supabase error', error);
      return res.status(500).json({ error: 'Failed to store chunks' });
    }

    return res.status(200).json({ ok: true, docId, chunks: rows.length, filename });
  } catch (err: any) {
    console.error('upload-file error', err);
    return res.status(400).json({ error: err.message || 'Failed to process file' });
  }
}
