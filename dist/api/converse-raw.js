"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const rag_1 = require("../lib/rag");
async function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (d) => chunks.push(d));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
    });
}
async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const raw = await readRawBody(req);
        const text = raw.toString('utf8').trim();
        if (!text)
            return res.status(400).json({ error: 'Empty body' });
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (e) {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
        const docId = typeof parsed.docId === 'string' && parsed.docId.trim() ? parsed.docId.trim() : undefined;
        if (!query)
            return res.status(400).json({ error: 'Missing query' });
        const { answer, chunks } = await (0, rag_1.runRAG)(query, 5, docId);
        return res.status(200).json({ answer, chunks });
    }
    catch (err) {
        console.error('api/converse-raw error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
