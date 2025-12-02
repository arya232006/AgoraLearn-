import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'POST') {
      const { user_id, amount, category } = req.body as {
        user_id?: string;
        amount?: number;
        category?: string;
      };

      const { data, error } = await supabase
        .from('expenses')
        .insert([{ user_id, amount, category }])
        .select();

      if (error) return res.status(500).json({ error });
      return res.status(200).json(data?.[0] ?? null);
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error });
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id || req.body?.id) as string | string[] | undefined;
      const idValue = Array.isArray(id) ? id[0] : id;

      if (!idValue) {
        return res.status(400).json({ error: 'Missing id' });
      }

      const { error } = await supabase.from('expenses').delete().eq('id', idValue);
      if (error) return res.status(500).json({ error });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('api/expenses error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
