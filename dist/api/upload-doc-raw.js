"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const mammoth_1 = __importDefault(require("mammoth"));
const chunk_1 = require("../lib/chunk");
const embeddings_1 = require("../lib/embeddings");
const supabase_1 = require("../lib/supabase");
const crypto_1 = __importDefault(require("crypto"));
async function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (d) => chunks.push(d));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
    });
}
function normalizeEmbedding(raw) {
    if (Array.isArray(raw)) {
        if (raw.length === 0)
            return [];
        if (Array.isArray(raw[0]))
            return raw.map(Number);
        if (typeof raw[0] === 'number')
            return raw.map(Number);
    }
    if (raw && typeof raw === 'object' && 'embedding' in raw) {
        const emb = raw.embedding;
        if (Array.isArray(emb))
            return emb.map(Number);
    }
    throw new Error('Unexpected embedding format');
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
        const fileBase64 = typeof parsed.fileBase64 === 'string' ? parsed.fileBase64 : (typeof parsed.file === 'string' ? parsed.file : '');
        if (!fileBase64)
            return res.status(400).json({ error: 'Missing fileBase64' });
        let buffer;
        try {
            buffer = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        }
        catch (e) {
            return res.status(400).json({ error: 'Invalid base64' });
        }
        if (!buffer.length)
            return res.status(400).json({ error: 'Decoded file is empty' });
        const docId = typeof parsed.docId === 'string' && parsed.docId.trim() ? parsed.docId.trim() : crypto_1.default.randomUUID();
        let extracted;
        try {
            const result = await mammoth_1.default.extractRawText({ buffer });
            extracted = (result.value || '').replace(/\s+/g, ' ').trim();
        }
        catch (err) {
            console.error('upload-doc-raw mammoth error:', err);
            return res.status(400).json({ error: 'Failed to extract text from .docx' });
        }
        if (!extracted)
            return res.status(400).json({ error: 'No readable text found in document' });
        const chunks = (0, chunk_1.chunkText)(extracted).filter(Boolean);
        const rows = await Promise.all(chunks.map(async (chunk) => {
            const rawEmb = await (0, embeddings_1.embedText)(chunk);
            const embedding = normalizeEmbedding(rawEmb);
            return { doc_id: docId, text: chunk, embedding };
        }));
        const { error } = await supabase_1.supabase.from('chunks').insert(rows);
        if (error) {
            console.error('upload-doc-raw supabase error:', error);
            return res.status(500).json({ error: 'Failed to store chunks', details: error });
        }
        return res.status(200).json({ ok: true, docId, chunksInserted: rows.length });
    }
    catch (err) {
        console.error('api/upload-doc-raw error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
