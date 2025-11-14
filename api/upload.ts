/**
 * Example:
 * curl -X POST https://your-deploy.vercel.app/api/upload \
 *   -H "Content-Type: application/json" \
 *   -d '{"text":"Long study notes ...","docId":"optional-doc-id"}'
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';
import crypto from 'crypto';

const MAX_TEXT_LENGTH = 500_000; // defensive maximum

// Normalize different HF wrapper responses into a flat number[] embedding
function normalizeEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    // nested array like [[...]] -> take first inner array
    if (Array.isArray(raw[0])) {
      const first = raw[0] as unknown;
      if (Array.isArray(first)) return (first as unknown[]).map(Number);
    }
    // flat array [num, num, ...]
    if (typeof raw[0] === 'number') return (raw as unknown[]).map(Number);
  }
  // possible shape: { embedding: [...] }
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
    const text = typeof body.text === 'string' ? body.text : undefined;
    let docId = typeof body.docId === 'string' && body.docId.trim() ? body.docId.trim() : undefined;

    if (!text) return res.status(400).json({ error: 'Missing required field: text (string)' });
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(413).json({ error: `Text too large. Max ${MAX_TEXT_LENGTH} characters allowed.` });
    }

    if (!docId) docId = crypto.randomUUID();

    // Chunk the document using helper
    const chunks = chunkText(text);

    // Compute embeddings in parallel and prepare rows for insertion
    const rows = await Promise.all(
      chunks.map(async (chunk) => {
        const raw = await embedText(chunk);
        const embedding = normalizeEmbedding(raw);
        return { doc_id: docId, text: chunk, embedding };
      })
    );

    // Batch insert into Supabase
    const { error } = await supabase.from('chunks').insert(rows);
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to insert chunks', details: error });
    }

    return res.status(200).json({ ok: true, docId, chunksInserted: rows.length });
  } catch (err: any) {
    console.error('api/upload error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
