/**
 * POST /api/upload-doc
 *
 * Body: { fileBase64: string, docId?: string }
 *
 * Accepts a .docx file as base64, extracts plain text via mammoth,
 * then reuses the same chunk + embed + Supabase pipeline as /api/upload.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';
import crypto from 'crypto';
import mammoth from 'mammoth';

const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function normalizeEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) {
      const first = raw[0] as unknown;
      if (Array.isArray(first)) return (first as unknown[]).map(Number);
    }
    if (typeof raw[0] === 'number') return (raw as unknown[]).map(Number);
  }
  if (raw && typeof raw === 'object' && 'embedding' in (raw as any)) {
    const emb = (raw as any).embedding;
    if (Array.isArray(emb)) return emb.map(Number);
  }
  throw new Error('Unexpected embedding format');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body ?? {};
    const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';
    let docId = typeof body.docId === 'string' && body.docId.trim() ? body.docId.trim() : undefined;

    if (!fileBase64) {
      return res.status(400).json({ error: 'Missing required field: fileBase64 (base64-encoded .docx)' });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch (err: any) {
      return res.status(400).json({ error: 'Invalid base64 in fileBase64' });
    }

    if (!buffer.length) {
      return res.status(400).json({ error: 'Decoded file is empty' });
    }

    if (buffer.length > MAX_DOC_SIZE_BYTES) {
      return res.status(413).json({ error: `Document too large. Max ${MAX_DOC_SIZE_BYTES} bytes` });
    }

    if (!docId) docId = crypto.randomUUID();

    let text: string;
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value || '').replace(/\s+/g, ' ').trim();
    } catch (err: any) {
      console.error('upload-doc mammoth error:', err);
      return res.status(400).json({ error: 'Failed to extract text from .docx file' });
    }

    if (!text) {
      return res.status(400).json({ error: 'No readable text found in document' });
    }

    const chunks = chunkText(text);

    const rows = await Promise.all(
      chunks.map(async (chunk) => {
        const raw = await embedText(chunk);
        const embedding = normalizeEmbedding(raw);
        return { doc_id: docId!, text: chunk, embedding };
      })
    );

    const { error } = await supabase.from('chunks').insert(rows);
    if (error) {
      console.error('upload-doc supabase error:', error);
      return res.status(500).json({ error: 'Failed to store chunks', details: error });
    }

    return res.status(200).json({ ok: true, docId, chunksInserted: rows.length });
  } catch (err: any) {
    console.error('api/upload-doc error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
