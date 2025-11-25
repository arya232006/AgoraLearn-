import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
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

    const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
    const docId = typeof parsed.docId === 'string' && parsed.docId.trim() ? parsed.docId.trim() : undefined;

    if (!query) return res.status(400).json({ error: 'Missing query' });

    const { answer, chunks } = await runRAG(query, 5, docId);
    return res.status(200).json({ answer, chunks });
  } catch (err: any) {
    console.error('api/converse-raw error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
