import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body as { query?: string } | undefined;
    const query = body?.query;

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const { answer, chunks } = await runRAG(query);
    return res.status(200).json({ answer, chunks });
  } catch (err: any) {
    console.error('api/converse error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
