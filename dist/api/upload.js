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
const busboy_1 = __importDefault(require("busboy"));
const mammoth_1 = __importDefault(require("mammoth"));
const crypto_1 = require("crypto");
const chunk_1 = require("../lib/chunk");
const embeddings_1 = require("../lib/embeddings");
const supabase_1 = require("../lib/supabase");
const safeParse_1 = require("../utils/safeParse");
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
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const busboy = (0, busboy_1.default)({ headers: req.headers });
        const fields = {};
        let fileBuffer;
        let filename;
        let mimeType;
        try {
            console.debug('parseMultipart: has rawBody=', Boolean(req.rawBody), 'bodyType=', typeof req.body, 'hasPipe=', typeof req.pipe === 'function');
        }
        catch (e) {
            // ignore
        }
        busboy.on('file', (_fieldname, file, info) => {
            filename = info?.filename;
            mimeType = (info?.mimeType || info?.mime || '');
            const chunks = [];
            file.on('data', (d) => chunks.push(d));
            file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
        });
        busboy.on('field', (name, val) => { fields[name] = String(val); });
        busboy.on('error', (err) => {
            // Improve error messaging for a common Windows curl multipart truncation issue
            try {
                const msg = String(err?.message || err);
                if (msg.includes('Unexpected end of form')) {
                    return reject(new Error('Unexpected end of form (multipart truncated). This commonly happens with Windows curl sending an `Expect: 100-continue` header. Try adding `-H "Expect:"` or `--http1.1` to your curl command, or upload as base64 JSON. Original error: ' + msg));
                }
            }
            catch (e) {
                // fallthrough to reject original error
            }
            return reject(err);
        });
        // If the client aborts or the connection closes during upload, surface a clearer error
        req.on && req.on('aborted', () => reject(new Error('Request aborted by the client during multipart upload')));
        req.on && req.on('close', () => {
            // If busboy already finished we will have resolved; otherwise, reject to avoid hanging
            if (!fileBuffer)
                reject(new Error('Connection closed during multipart upload'));
        });
        busboy.on('finish', () => resolve({ fileBuffer, filename, mimeType, fields }));
        // In some runtimes (Vercel dev / serverless) the incoming request stream
        // may have already been consumed or buffered by a body parser. If so,
        // try to reconstruct a readable stream from available raw body buffers.
        const tryPipe = () => {
            try {
                if (req.rawBody) {
                    const { Readable } = require('stream');
                    const s = new Readable();
                    s.push(req.rawBody);
                    s.push(null);
                    return s.pipe(busboy);
                }
                if (Buffer.isBuffer(req.body)) {
                    const { Readable } = require('stream');
                    const s = new Readable();
                    s.push(req.body);
                    s.push(null);
                    return s.pipe(busboy);
                }
                if (typeof req.body === 'string' && req.body.length) {
                    const { Readable } = require('stream');
                    const s = new Readable();
                    s.push(Buffer.from(req.body, 'utf8'));
                    s.push(null);
                    return s.pipe(busboy);
                }
                // Default: pipe the incoming request stream
                return req.pipe(busboy);
            }
            catch (e) {
                // If piping fails, emit an error so the caller gets a helpful message
                process.nextTick(() => busboy.emit('error', e));
            }
        };
        tryPipe();
    });
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
            // Newer versions export a PDFParse class; older expose a function. Handle both.
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
        // Try GPT Vision if configured
        if (process.env.USE_GPT_VISION === '1') {
            try {
                const { ocrWithGptVision } = await Promise.resolve().then(() => __importStar(require('../lib/vision')));
                return await ocrWithGptVision(fileBuffer, mimeType || 'image/*');
            }
            catch (err) {
                const emsg = String(err?.message ?? err ?? '');
                console.error('GPT Vision OCR error', emsg);
                if (!emsg.toLowerCase().includes('model_not_found') && !emsg.toLowerCase().includes('does not exist')) {
                    throw new Error(emsg || 'Failed to perform OCR with GPT Vision');
                }
                console.warn('GPT Vision model not available, falling back to tesseract');
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
    let filtered = chunks.filter((c) => !isNoisyChunk(c));
    // Soft-fallback: if all chunks are filtered out, ingest the original text as one chunk
    if (!filtered.length) {
        console.warn('All chunks filtered out as noise; falling back to ingest original text as one chunk');
        filtered = [text.trim()];
    }
    const rows = await Promise.all(filtered.map(async (chunk) => {
        try {
            console.debug('Embedding chunk preview:', chunk.slice(0, 120).replace(/\n/g, ' '));
            const raw = await (0, embeddings_1.embedText)(chunk);
            const embedding = normalizeEmbedding(raw);
            return { doc_id: docId, text: chunk, embedding };
        }
        catch (e) {
            console.error('Error embedding chunk (len=' + String(chunk?.length ?? 0) + '):', e?.message ?? e);
            console.error('Chunk (hex preview):', Buffer.from(String(chunk || '')).toString('hex').slice(0, 200));
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    // Diagnostic logs: headers and body preview to help debug parsing issues
    try {
        const _contentTypeHeader = String(req.headers['content-type'] || '');
        console.debug('api/upload headers=', req.headers);
        console.debug('api/upload content-type=', _contentTypeHeader);
        // Avoid touching `req.body` for multipart requests because some runtimes
        // (Vercel dev / body parsers) may consume the request stream, leaving
        // Busboy with a truncated stream. Only preview body for non-multipart types.
        if (!_contentTypeHeader.toLowerCase().includes('multipart/form-data')) {
            try {
                const preview = typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 1000) : String(req.body).slice(0, 1000);
                console.debug('api/upload body preview=', preview);
            }
            catch (e) {
                console.debug('api/upload body preview: <unavailable>');
            }
        }
        else {
            console.debug('api/upload body preview: <skipped for multipart/form-data>');
        }
    }
    catch (e) {
        console.debug('api/upload logging error', String(e));
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        // JSON mode
        if (contentType.includes('application/json')) {
            // Use safeParseJson to handle cases where Vercel's JSON parser failed
            const body = (await (0, safeParse_1.safeParseJson)(req)) ?? (req.body ?? {});
            // text upload
            if (typeof body.text === 'string' && body.text.trim()) {
                const docId = body.docId || (0, crypto_1.randomUUID)();
                const result = await ingestTextAndStore(body.text, docId);
                const respObj = { ok: true, file: { id: docId, name: 'text-upload.txt' }, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
            }
            // URL upload
            if (typeof body.url === 'string' && body.url.trim()) {
                const url = body.url.trim();
                const docId = body.docId || (0, crypto_1.randomUUID)();
                const resp = await fetch(url);
                if (!resp.ok)
                    return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
                const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
                // If the fetched resource is a PDF, treat as binary and extract via pdf-parse
                if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
                    const ab = await resp.arrayBuffer();
                    const buf = Buffer.from(ab);
                    const text = await extractTextFromBuffer(buf, 'download.pdf', 'application/pdf');
                    const result = await ingestTextAndStore(text, docId);
                    const respObj = { ok: true, file: { id: docId, name: 'download.pdf' }, sourceUrl: url, ...result };
                    console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                    return res.status(200).json(respObj);
                }
                const html = await resp.text();
                const text = stripHtml(html);
                const result = await ingestTextAndStore(text, docId);
                const respObj = { ok: true, file: { id: docId, name: 'download.html' }, sourceUrl: url, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
            }
            // base64 file upload (docx or image)
            const fileBase64 = body.fileBase64 || body.file || body.data;
            if (fileBase64) {
                const filename = body.filename || 'upload.bin';
                const mimeType = body.mimeType || guessMimeFromFilename(filename);
                const buf = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
                const docId = body.docId || (0, crypto_1.randomUUID)();
                const text = await extractTextFromBuffer(buf, filename, mimeType);
                const result = await ingestTextAndStore(text, docId);
                const respObj = { ok: true, file: { id: docId, name: filename }, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
            }
            return res.status(400).json({ error: 'Missing action in JSON body (text | url | fileBase64)' });
        }
        // multipart/form-data mode
        if (contentType.includes('multipart/form-data')) {
            const parsed = await parseMultipart(req);
            const fields = parsed.fields || {};
            // text field
            if (typeof fields.text === 'string' && fields.text.trim()) {
                const docId = fields.docId || (0, crypto_1.randomUUID)();
                const result = await ingestTextAndStore(fields.text, docId);
                const respObj = { ok: true, file: { id: docId, name: 'text-upload.txt' }, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
            }
            // url field
            if (typeof fields.url === 'string' && fields.url.trim()) {
                const url = fields.url.trim();
                const docId = fields.docId || (0, crypto_1.randomUUID)();
                const resp = await fetch(url);
                if (!resp.ok)
                    return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
                const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
                    const ab = await resp.arrayBuffer();
                    const buf = Buffer.from(ab);
                    const text = await extractTextFromBuffer(buf, 'download.pdf', 'application/pdf');
                    const result = await ingestTextAndStore(text, docId);
                    const respObj = { ok: true, file: { id: docId, name: 'download.pdf' }, sourceUrl: url, ...result };
                    console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                    return res.status(200).json(respObj);
                }
                const html = await resp.text();
                const text = stripHtml(html);
                const result = await ingestTextAndStore(text, docId);
                const respObj = { ok: true, file: { id: docId, name: 'download.html' }, sourceUrl: url, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
            }
            // file upload
            if (parsed.fileBuffer) {
                console.log('[UPLOAD] Received file:', {
                    filename: parsed.filename,
                    mimeType: parsed.mimeType,
                    bufferLength: parsed.fileBuffer?.length,
                    bufferType: typeof parsed.fileBuffer,
                });
                const filename = parsed.filename || 'upload.bin';
                const mimeType = parsed.mimeType || guessMimeFromFilename(filename);
                const fileSize = parsed.fileBuffer?.length || 0;
                let text = '';
                try {
                    text = await extractTextFromBuffer(parsed.fileBuffer, filename, mimeType);
                    console.log('[UPLOAD] PDF/Text extraction succeeded. Text length:', text.length);
                }
                catch (err) {
                    console.error('[UPLOAD] PDF/Text extraction FAILED:', err);
                    throw err;
                }
                // Insert file metadata into files table
                const docId = fields.docId || (0, crypto_1.randomUUID)();
                let fileError = null;
                const insertResult = await supabase_1.supabase.from('files').insert({
                    id: docId,
                    name: filename,
                    size: fileSize,
                    uploaded_at: new Date().toISOString(),
                    doc_id: docId,
                });
                fileError = insertResult.error;
                if (fileError) {
                    console.error('[UPLOAD] Error inserting file metadata:', fileError);
                }
                else {
                    console.log('[UPLOAD] File metadata inserted successfully.');
                }
                const result = await ingestTextAndStore(text, docId);
                console.log('[UPLOAD] Chunking/embedding succeeded. Chunks inserted:', result?.chunksInserted);
                const respObj = { ok: true, file: { id: docId, name: filename }, ...result };
                console.log('[UPLOAD] Response:', JSON.stringify(respObj));
                return res.status(200).json(respObj);
                // ...existing code...
            }
            return res.status(400).json({ error: 'No file or actionable fields found in multipart body' });
        }
        return res.status(400).json({ error: 'Unsupported Content-Type. Send JSON or multipart/form-data' });
    }
    catch (err) {
        console.error('api/upload consolidated error:', err);
        if (err && err.stack)
            console.error(err.stack);
        // Return the message but also include a short debug hint
        return res.status(400).json({ error: err?.message || 'Failed to process upload', hint: 'See server logs for stack and chunk previews' });
    }
}
