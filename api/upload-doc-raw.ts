import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';
import crypto from 'crypto';

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

function normalizeEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) return (raw as unknown[]).map(Number);
    if (typeof raw[0] === 'number') return (raw as unknown[]).map(Number);
  }
  if (raw && typeof raw === 'object' && 'embedding' in (raw as any)) {
    const emb = (raw as any).embedding;
    if (Array.isArray(emb)) return emb.map(Number);
  }
  throw new Error('Unexpected embedding format');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const raw = await readRawBody(req);
    const text = raw.toString('utf8').trim();
    if (!text) return res.status(400).json({ error: 'Empty body' });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const fileBase64 = typeof parsed.fileBase64 === 'string' ? parsed.fileBase64 : (typeof parsed.file === 'string' ? parsed.file : '');
    if (!fileBase64) return res.status(400).json({ error: 'Missing fileBase64' });

    let buffer: Buffer;
    try {
      buffer = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid base64' });
    }

    if (!buffer.length) return res.status(400).json({ error: 'Decoded file is empty' });

    const docId = typeof parsed.docId === 'string' && parsed.docId.trim() ? parsed.docId.trim() : crypto.randomUUID();

    let extracted: string;
    try {
      const result = await mammoth.extractRawText({ buffer });
      extracted = (result.value || '').replace(/\s+/g, ' ').trim();
    } catch (err: any) {
      console.error('upload-doc-raw mammoth error:', err);
      return res.status(400).json({ error: 'Failed to extract text from .docx' });
    }

    if (!extracted) return res.status(400).json({ error: 'No readable text found in document' });

    const chunks = chunkText(extracted).filter(Boolean);

    const rows = await Promise.all(
      chunks.map(async (chunk) => {
        const rawEmb = await embedText(chunk);
        const embedding = normalizeEmbedding(rawEmb);
        return { doc_id: docId, text: chunk, embedding };
      })
    );

    const { error } = await supabase.from('chunks').insert(rows as any);
    if (error) {
      console.error('upload-doc-raw supabase error:', error);
      return res.status(500).json({ error: 'Failed to store chunks', details: error });
    }

    return res.status(200).json({ ok: true, docId, chunksInserted: rows.length });
  } catch (err: any) {
    console.error('api/upload-doc-raw error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
