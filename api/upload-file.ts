import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
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

  // Images are not supported in this prototype.
  if (mimeType.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|bmp|tiff?)$/)) {
    throw new Error('Images are not supported in this prototype. Please upload a .docx file or provide text/URL.');
  }

  throw new Error('Unsupported file type. Please upload a DOCX file.');
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
