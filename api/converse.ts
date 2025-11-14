import express from 'express';
import { runRAG } from '../lib/rag';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const { answer, chunks } = await runRAG(query);
    res.json({ answer, chunks });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default app;
