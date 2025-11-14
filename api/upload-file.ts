import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';

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

  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    const result = await pdf(fileBuffer as any);
    return result.text || '';
  }

  if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || '';
  }

  // For now, unsupported types
  throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fileBuffer, filename, mimeType, docId: providedDocId } = await parseMultipart(req);

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
