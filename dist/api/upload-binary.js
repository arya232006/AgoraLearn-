"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const mammoth_1 = __importDefault(require("mammoth"));
const crypto_1 = require("crypto");
const chunk_1 = require("../lib/chunk");
const embeddings_1 = require("../lib/embeddings");
const supabase_1 = require("../lib/supabase");
const MAX_TEXT_LENGTH = 500000;
const MIN_CHUNK_LENGTH = 100;
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
function guessMimeFromFilename(filename) {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return 'image/jpeg';
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    if (lower.endsWith('.bmp'))
        return 'image/bmp';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff'))
        return 'image/tiff';
    if (lower.endsWith('.docx'))
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return 'application/octet-stream';
}
function stripHtml(html) {
    const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
    return withoutTags.replace(/\s+/g, ' ').trim();
}
async function extractTextFromBuffer(fileBuffer, filename, mimeType) {
    const lower = (filename || '').toLowerCase();
    const mt = (mimeType || '').toLowerCase();
    // DOCX
    if (lower.endsWith('.docx') || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth_1.default.extractRawText({ buffer: fileBuffer });
        return (result.value || '').replace(/\s+/g, ' ').trim();
    }
    // PDF
    if (mt === 'application/pdf' || lower.endsWith('.pdf')) {
        try {
            const pdfMod = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
            if (pdfMod && typeof pdfMod.PDFParse === 'function') {
                const PDFParse = pdfMod.PDFParse;
                const parser = new PDFParse({ data: fileBuffer });
                const data = await parser.getText();
                return (data?.text || '').replace(/\s+/g, ' ').trim();
            }
            if (typeof pdfMod === 'function') {
                const data = await pdfMod(fileBuffer);
                return (data?.text || '').replace(/\s+/g, ' ').trim();
            }
            if (pdfMod && typeof pdfMod.default === 'function') {
                const data = await pdfMod.default(fileBuffer);
                return (data?.text || '').replace(/\s+/g, ' ').trim();
            }
            if (pdfMod && typeof pdfMod.parse === 'function') {
                const data = await pdfMod.parse(fileBuffer);
                return (data?.text || '').replace(/\s+/g, ' ').trim();
            }
            console.error('pdf-parse import shape:', pdfMod ? Object.keys(pdfMod).join(',') : '<empty>');
            throw new Error('Incompatible pdf-parse import');
        }
        catch (err) {
            console.error('PDF parse error', err?.message ?? err);
            const emsg = String(err?.message ?? err ?? '');
            throw new Error('Failed to extract text from PDF: ' + emsg);
        }
    }
    // Images
    if (mt.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|bmp|tiff?)$/)) {
        // Try GPT Vision if configured. If it fails (network, timeout, model),
        // fall back to Tesseract unless the API key is missing.
        if (process.env.USE_GPT_VISION === '1') {
            try {
                console.debug('api/upload-binary: attempting OCR with GPT Vision (timeout ms=', process.env.OPENAI_REQUEST_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 30000, ')');
                const { ocrWithGptVision } = await Promise.resolve().then(() => __importStar(require('../lib/vision')));
                const vtxt = await ocrWithGptVision(fileBuffer, mimeType || 'image/*');
                console.debug('api/upload-binary: GPT Vision OCR completed; text length=', vtxt?.length ?? 0);
                return vtxt;
            }
            catch (err) {
                const emsg = String(err?.message ?? err ?? '');
                console.error('GPT Vision OCR error', emsg);
                // If the error is specifically missing API key, propagate it so the
                // caller can surface the configuration issue.
                if (emsg.toLowerCase().includes('missing openai_api_key')) {
                    throw new Error(emsg || 'Missing OPENAI_API_KEY for GPT Vision');
                }
                // Otherwise, warn and fall back to tesseract.
                console.warn('Falling back to tesseract OCR due to GPT Vision error');
            }
        }
        // Tesseract fallback
        try {
            const tesseract = await Promise.resolve().then(() => __importStar(require('tesseract.js'))).catch((e) => { throw e; });
            const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
            if (!createWorker)
                throw new Error('Incompatible tesseract.js export');
            const worker = createWorker();
            await worker.load();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            const { data } = await worker.recognize(fileBuffer);
            await worker.terminate();
            return data?.text || '';
        }
        catch (err) {
            console.error('Tesseract OCR error', err?.message ?? err);
            throw new Error('Failed to perform OCR on image');
        }
    }
    throw new Error('Unsupported file type. Please upload a DOCX, PDF, or image file.');
}
async function ingestTextAndStore(text, providedDocId) {
    if (!text || !text.trim())
        throw new Error('No text to ingest');
    if (text.length > MAX_TEXT_LENGTH)
        throw new Error(`Text too large. Max ${MAX_TEXT_LENGTH} characters allowed.`);
    const docId = providedDocId || (0, crypto_1.randomUUID)();
    const chunks = (0, chunk_1.chunkText)(text).filter((c) => c && c.trim().length > 0);
    // Patch: Do not filter out any chunks as noise
    const rows = await Promise.all(chunks.map(async (chunk) => {
        try {
            console.debug('Embedding chunk preview:', chunk.slice(0, 120).replace(/\n/g, ' '));
            const raw = await (0, embeddings_1.embedText)(chunk);
            const embedding = normalizeEmbedding(raw);
            return { doc_id: docId, text: chunk, embedding };
        }
        catch (e) {
            console.error('Error embedding chunk (len=' + String(chunk?.length ?? 0) + '):', e?.message ?? e);
            throw e;
        }
    }));
    const { error } = await supabase_1.supabase.from('chunks').insert(rows);
    if (error)
        throw error;
    return { docId, chunksInserted: rows.length };
}
async function handler(req, res) {
    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-DocId');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        // Attempt to read binary body. Vercel dev may expose `rawBody`; older runtimes may have Buffer in req.body.
        let buf;
        if (req.rawBody && Buffer.isBuffer(req.rawBody))
            buf = req.rawBody;
        else if (req.body && Buffer.isBuffer(req.body))
            buf = req.body;
        // If body is a string, assume it's binary represented as latin1
        else if (typeof req.body === 'string' && (req.headers['content-type'] || '').startsWith('application/octet-stream')) {
            buf = Buffer.from(req.body, 'binary');
        }
        // If still no buffer, try to read the stream into a buffer
        if (!buf) {
            const chunks = [];
            await new Promise((resolve, reject) => {
                req.on('data', (d) => {
                    // log small progress for debugging
                    try {
                        console.debug('api/upload-binary: receiving chunk size=', Buffer.isBuffer(d) ? d.length : 0);
                    }
                    catch (e) { }
                    chunks.push(Buffer.from(d));
                });
                req.on('end', () => { try {
                    console.debug('api/upload-binary: request stream end');
                }
                catch (e) { } ; resolve(); });
                req.on('error', (e) => { console.error('api/upload-binary: request stream error', e); reject(e); });
            });
            if (chunks.length)
                buf = Buffer.concat(chunks);
        }
        if (!buf || buf.length === 0)
            return res.status(400).json({ error: 'Empty request body. Send raw binary with --data-binary @file' });
        const filename = String(req.headers['x-filename'] || req.query.filename || '').trim() || 'upload.bin';
        const docId = String(req.headers['x-docid'] || req.query.docId || req.query.docid || '').trim() || undefined;
        // Prefer an explicit content-type header, but if the client sent a generic
        // `application/octet-stream` (common with raw curl uploads), prefer guessing
        // the mime type from the filename so GPT Vision receives a valid image MIME.
        const headerMime = String(req.headers['content-type'] || '').trim();
        const guessed = guessMimeFromFilename(filename);
        const mimeType = (headerMime && headerMime !== 'application/octet-stream') ? headerMime : guessed;
        console.debug('api/upload-binary: received body length=', buf.length, 'filename=', filename, 'mimeType=', mimeType, 'docId=', docId);
        console.debug('api/upload-binary: starting extractTextFromBuffer');
        let text;
        try {
            text = await extractTextFromBuffer(buf, filename, mimeType || undefined);
            console.debug('api/upload-binary: extractTextFromBuffer completed; text length=', text ? text.length : 0);
        }
        catch (e) {
            console.error('api/upload-binary: extractTextFromBuffer failed:', e?.message ?? e);
            console.error(e?.stack || '<no stack>');
            throw e;
        }
        console.debug('api/upload-binary: starting ingestTextAndStore');
        let result;
        try {
            result = await ingestTextAndStore(text, docId);
            console.debug('api/upload-binary: ingestTextAndStore completed; chunksInserted=', result?.chunksInserted);
        }
        catch (e) {
            console.error('api/upload-binary: ingestTextAndStore failed:', e?.message ?? e);
            console.error(e?.stack || '<no stack>');
            throw e;
        }
        return res.status(200).json({ ok: true, filename, ...result });
    }
    catch (err) {
        console.error('api/upload-binary error:', err);
        return res.status(400).json({ error: err?.message || 'Failed to process binary upload' });
    }
}
