"use strict";
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
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const busboy = (0, busboy_1.default)({ headers: req.headers });
        let fileBuffer = null;
        let filename = '';
        let mimeType = '';
        let docId;
        busboy.on('file', (_fieldname, file, info) => {
            filename = info.filename;
            mimeType = info.mimeType || '';
            const chunks = [];
            file.on('data', (d) => {
                chunks.push(d);
            });
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });
        busboy.on('field', (fieldname, val) => {
            if (fieldname === 'docId') {
                docId = val;
            }
        });
        busboy.on('error', (err) => reject(err));
        busboy.on('finish', () => {
            if (!fileBuffer || !filename) {
                return reject(new Error('No file uploaded'));
            }
            resolve({ fileBuffer, filename, mimeType, docId });
        });
        req.pipe(busboy);
    });
}
async function extractTextFromFile(fileBuffer, filename, mimeType) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth_1.default.extractRawText({ buffer: fileBuffer });
        return result.value || '';
    }
    // Images are not supported in this prototype.
    if (mimeType.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|bmp|tiff?)$/)) {
        throw new Error('Images are not supported in this prototype. Please upload a .docx file or provide text/URL.');
    }
    throw new Error('Unsupported file type. Please upload a DOCX file.');
}
async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        // Support two upload modes:
        // 1) multipart/form-data (handled by Busboy)
        // 2) JSON body with { fileBase64, filename, mimeType, docId }
        let fileBuffer;
        let filename;
        let mimeType;
        let providedDocId;
        const contentType = (req.headers['content-type'] || '');
        if (contentType.includes('application/json')) {
            const body = req.body ?? {};
            const fileBase64 = body.fileBase64 || body.file || body.data;
            if (!fileBase64) {
                return res.status(400).json({ error: 'Missing fileBase64 in JSON body' });
            }
            fileBuffer = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
            filename = body.filename || 'upload.bin';
            mimeType = body.mimeType || 'application/octet-stream';
            providedDocId = body.docId;
        }
        else {
            const parsed = await parseMultipart(req);
            fileBuffer = parsed.fileBuffer;
            filename = parsed.filename;
            // prefer declared mimeType from parser, but fall back to guessing from filename
            mimeType = parsed.mimeType || guessMimeFromFilename(filename) || 'application/octet-stream';
            providedDocId = parsed.docId;
        }
        const docId = providedDocId || (0, crypto_1.randomUUID)();
        const text = await extractTextFromFile(fileBuffer, filename, mimeType);
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'No text could be extracted from the file.' });
        }
        const chunks = (0, chunk_1.chunkText)(text);
        const rows = [];
        for (const chunk of chunks) {
            const embedding = await (0, embeddings_1.embedText)(chunk);
            rows.push({ doc_id: docId, text: chunk, embedding: embedding });
        }
        const { error } = await supabase_1.supabase.from('chunks').insert(rows);
        if (error) {
            console.error('upload-file supabase error', error);
            return res.status(500).json({ error: 'Failed to store chunks' });
        }
        return res.status(200).json({ ok: true, docId, chunks: rows.length, filename });
    }
    catch (err) {
        console.error('upload-file error', err);
        return res.status(400).json({ error: err.message || 'Failed to process file' });
    }
}
