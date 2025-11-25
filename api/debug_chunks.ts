import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const docId = String((req.query.docId as string) || '').trim();
  if (!docId) return res.status(400).json({ error: 'Missing docId query parameter' });

  try {
    const { data, error } = await supabase.from('chunks').select('id,doc_id,text').eq('doc_id', docId).order('id', { ascending: true }).limit(100);
    if (error) return res.status(500).json({ error: error.message || error });
    return res.status(200).json({ ok: true, docId, rows: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
