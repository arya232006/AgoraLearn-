import express from 'express';
const app = express();
app.get('/', (_req, res) => res.json({ ok: true }));
export default app;
