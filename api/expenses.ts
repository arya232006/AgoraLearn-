import express from 'express';
import { supabase } from '../lib/supabase';

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
  const { user_id, amount, category } = req.body;
  const { data, error } = await supabase.from('expenses').insert([{ user_id, amount, category }]).select();
  if (error) return res.status(500).json({ error });
  res.json(data?.[0]);
});

app.get('/', async (req, res) => {
  const { data, error } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
});

export default app;
