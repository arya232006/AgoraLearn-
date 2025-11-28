"use strict";
/**
 * POST /api/upload-url
 *
 * Body: { url: string, docId?: string }
 *
 * Fetches the URL, extracts plain text, then reuses the
 * same chunk + embed + Supabase pipeline as /api/upload.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const chunk_1 = require("../lib/chunk");
const embeddings_1 = require("../lib/embeddings");
const supabase_1 = require("../lib/supabase");
const crypto_1 = __importDefault(require("crypto"));
const MAX_TEXT_LENGTH = 500000; // same defensive max as upload
// Heuristics to drop noisy chunks from complex HTML (navigation, scripts, etc.)
const MIN_CHUNK_LENGTH = 100;
function isNoisyChunk(text) {
    if (!text)
        return true;
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHUNK_LENGTH)
        return true;
    const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
    if (letters === 0)
        return true;
    const letterRatio = letters / trimmed.length;
    if (letterRatio < 0.6)
        return true;
    return false;
}
function stripHtml(html) {
    // Very simple HTML tag stripper; good enough for study articles.
    const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
    return withoutTags.replace(/\s+/g, ' ').trim();
}
// Reuse the same embedding normalisation logic as upload
function normalizeEmbedding(raw) {
    if (Array.isArray(raw)) {
        if (raw.length === 0)
            return [];
        if (Array.isArray(raw[0])) {
            const first = raw[0];
            if (Array.isArray(first))
                return first.map(Number);
        }
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
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        const body = req.body ?? {};
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        let docId = typeof body.docId === 'string' && body.docId.trim() ? body.docId.trim() : undefined;
        if (!url) {
            return res.status(400).json({ error: 'Missing required field: url (string)' });
        }
        let html;
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                return res.status(400).json({ error: `Failed to fetch URL: ${resp.status} ${resp.statusText}` });
            }
            html = await resp.text();
        }
        catch (err) {
            console.error('upload-url fetch error:', err);
            return res.status(400).json({ error: 'Failed to fetch URL contents' });
        }
        const text = stripHtml(html);
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'No readable text found at URL' });
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return res.status(413).json({ error: `Extracted text too large. Max ${MAX_TEXT_LENGTH} characters allowed.` });
        }
        if (!docId)
            docId = crypto_1.default.randomUUID();
        const chunks = (0, chunk_1.chunkText)(text);
        const filteredChunks = chunks.filter((chunk) => !isNoisyChunk(chunk));
        if (!filteredChunks.length) {
            return res.status(400).json({ error: 'All extracted chunks were filtered out as noise' });
        }
        const rows = await Promise.all(filteredChunks.map(async (chunk) => {
            const raw = await (0, embeddings_1.embedText)(chunk);
            const embedding = normalizeEmbedding(raw);
            return { doc_id: docId, text: chunk, embedding };
        }));
        const { error } = await supabase_1.supabase.from('chunks').insert(rows);
        if (error) {
            console.error('upload-url supabase error:', error);
            return res.status(500).json({ error: 'Failed to store chunks', details: error });
        }
        return res.status(200).json({ ok: true, docId, chunksInserted: rows.length, sourceUrl: url });
    }
    catch (err) {
        console.error('api/upload-url error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
