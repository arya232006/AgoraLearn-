import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';
import { safeParseJson } from '../utils/safeParse';

const MAX_TEXT_LENGTH = 500_000;
const MIN_CHUNK_LENGTH = 100;

function normalizeEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) {
      const first = raw[0] as unknown;
      if (Array.isArray(first)) return (first as unknown[]).map(Number);
    }
    if (typeof raw[0] === 'number') return (raw as unknown[]).map(Number);
  }
  if (raw && typeof raw === 'object' && 'embedding' in (raw as any)) {
    const emb = (raw as any).embedding;
    if (Array.isArray(emb)) return emb.map(Number);
  }
  throw new Error('Unexpected embedding format');
}

function isNoisyChunk(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHUNK_LENGTH) return true;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (letters === 0) return true;
  const letterRatio = letters / trimmed.length;
  if (letterRatio < 0.6) return true;
  return false;
}

function guessMimeFromFilename(filename: string) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function stripHtml(html: string): string {
  const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                             .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function parseMultipart(req: VercelRequest): Promise<{ fileBuffer?: Buffer; filename?: string; mimeType?: string; fields: Record<string,string> }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as any });
    const fields: Record<string,string> = {};
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;
    try {
      console.debug('parseMultipart: has rawBody=', Boolean((req as any).rawBody), 'bodyType=', typeof (req as any).body, 'hasPipe=', typeof (req as any).pipe === 'function');
    } catch (e) {
      // ignore
    }

    busboy.on('file', (_fieldname: string, file: NodeJS.ReadableStream, info: any) => {
      filename = info?.filename;
      mimeType = (info?.mimeType || info?.mime || '') as string;
      const chunks: Buffer[] = [];
      file.on('data', (d: Buffer) => chunks.push(d));
      file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    busboy.on('field', (name: string, val: string) => { fields[name] = String(val); });
    busboy.on('error', (err: Error) => {
      // Improve error messaging for a common Windows curl multipart truncation issue
      try {
        const msg = String(err?.message || err);
        if (msg.includes('Unexpected end of form')) {
          return reject(new Error('Unexpected end of form (multipart truncated). This commonly happens with Windows curl sending an `Expect: 100-continue` header. Try adding `-H "Expect:"` or `--http1.1` to your curl command, or upload as base64 JSON. Original error: ' + msg));
        }
      } catch (e) {
        // fallthrough to reject original error
      }
      return reject(err);
    });

    // If the client aborts or the connection closes during upload, surface a clearer error
    req.on && req.on('aborted', () => reject(new Error('Request aborted by the client during multipart upload')));
    req.on && req.on('close', () => {
      // If busboy already finished we will have resolved; otherwise, reject to avoid hanging
      if (!fileBuffer) reject(new Error('Connection closed during multipart upload'));
    });
    busboy.on('finish', () => resolve({ fileBuffer, filename, mimeType, fields }));
    // In some runtimes (Vercel dev / serverless) the incoming request stream
    // may have already been consumed or buffered by a body parser. If so,
    // try to reconstruct a readable stream from available raw body buffers.
    const tryPipe = () => {
      try {
        if ((req as any).rawBody) {
          const { Readable } = require('stream');
          const s = new Readable();
          s.push((req as any).rawBody);
          s.push(null);
          return s.pipe(busboy as any);
        }
        if (Buffer.isBuffer((req as any).body)) {
          const { Readable } = require('stream');
          const s = new Readable();
          s.push((req as any).body);
          s.push(null);
          return s.pipe(busboy as any);
        }
        if (typeof (req as any).body === 'string' && (req as any).body.length) {
          const { Readable } = require('stream');
          const s = new Readable();
          s.push(Buffer.from((req as any).body, 'utf8'));
          s.push(null);
          return s.pipe(busboy as any);
        }
        // Default: pipe the incoming request stream
        return (req as any).pipe(busboy as any);
      } catch (e) {
        // If piping fails, emit an error so the caller gets a helpful message
        process.nextTick(() => busboy.emit('error', e));
      }
    };

    tryPipe();
  });
}

async function extractTextFromBuffer(fileBuffer: Buffer, filename: string | undefined, mimeType: string | undefined): Promise<string> {
  const lower = (filename || '').toLowerCase();
  const mt = (mimeType || '').toLowerCase();

  // DOCX
  if (lower.endsWith('.docx') || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return (result.value || '').replace(/\s+/g, ' ').trim();
  }

  // PDF
  if (mt === 'application/pdf' || lower.endsWith('.pdf')) {
    try {
      const pdfMod = await import('pdf-parse');
      // Newer versions export a PDFParse class; older expose a function. Handle both.
      if (pdfMod && typeof (pdfMod as any).PDFParse === 'function') {
        const PDFParse = (pdfMod as any).PDFParse;
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        return (data?.text || '').replace(/\s+/g, ' ').trim();
      }
      if (typeof pdfMod === 'function') {
        const data = await (pdfMod as any)(fileBuffer as any);
        return (data?.text || '').replace(/\s+/g, ' ').trim();
      }
      if (pdfMod && typeof (pdfMod as any).default === 'function') {
        const data = await (pdfMod as any).default(fileBuffer as any);
        return (data?.text || '').replace(/\s+/g, ' ').trim();
      }
      if (pdfMod && typeof (pdfMod as any).parse === 'function') {
        const data = await (pdfMod as any).parse(fileBuffer as any);
        return (data?.text || '').replace(/\s+/g, ' ').trim();
      }
      console.error('pdf-parse import shape:', pdfMod ? Object.keys(pdfMod).join(',') : '<empty>');
      throw new Error('Incompatible pdf-parse import');
    } catch (err: any) {
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
        const { ocrWithGptVision } = await import('../lib/vision');
        return await ocrWithGptVision(fileBuffer, mimeType || 'image/*');
      } catch (err: any) {
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
      const tesseract = await import('tesseract.js').catch((e) => { throw e; });
      const createWorker = (tesseract as any).createWorker ?? (tesseract as any).default?.createWorker;
      if (!createWorker) throw new Error('Incompatible tesseract.js export');
      const worker = createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data } = await worker.recognize(fileBuffer);
      await worker.terminate();
      return data?.text || '';
    } catch (err: any) {
      console.error('Tesseract OCR error', err?.message ?? err);
      throw new Error('Failed to perform OCR on image');
    }
  }

  throw new Error('Unsupported file type. Please upload a DOCX, PDF, or image file.');
}

async function ingestTextAndStore(text: string, providedDocId?: string) {
  if (!text || !text.trim()) throw new Error('No text to ingest');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Text too large. Max ${MAX_TEXT_LENGTH} characters allowed.`);
  const docId = providedDocId || randomUUID();
  const chunks = chunkText(text).filter((c) => c && c.trim().length > 0);
  let filtered = chunks.filter((c) => !isNoisyChunk(c));
  // Soft-fallback: if all chunks are filtered out, ingest the original text as one chunk
  if (!filtered.length) {
    console.warn('All chunks filtered out as noise; falling back to ingest original text as one chunk');
    filtered = [text.trim()];
  }
  const rows = await Promise.all(filtered.map(async (chunk) => {
    try {
      console.debug('Embedding chunk preview:', chunk.slice(0, 120).replace(/\n/g, ' '));
      const raw = await embedText(chunk);
      const embedding = normalizeEmbedding(raw);
      return { doc_id: docId, text: chunk, embedding };
    } catch (e: any) {
      console.error('Error embedding chunk (len=' + String(chunk?.length ?? 0) + '):', e?.message ?? e);
      console.error('Chunk (hex preview):', Buffer.from(String(chunk || '')).toString('hex').slice(0, 200));
      throw e;
    }
  }));
  const { error } = await supabase.from('chunks').insert(rows as any);
  if (error) throw error;
  return { docId, chunksInserted: rows.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      } catch (e) {
        console.debug('api/upload body preview: <unavailable>');
      }
    } else {
      console.debug('api/upload body preview: <skipped for multipart/form-data>');
    }
  } catch (e) {
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
      const body = (await safeParseJson(req)) ?? (req.body ?? {});
      // text upload
      if (typeof body.text === 'string' && body.text.trim()) {
        const docId = body.docId || randomUUID();
        const result = await ingestTextAndStore(body.text, docId);
        const respObj = { ok: true, file: { id: docId, name: 'text-upload.txt' }, ...result };
        console.log('[UPLOAD] Response:', JSON.stringify(respObj));
        return res.status(200).json(respObj);
      }

      // URL upload
      if (typeof body.url === 'string' && body.url.trim()) {
        const url = body.url.trim();
        const docId = body.docId || randomUUID();
        const resp = await fetch(url);
        if (!resp.ok) return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
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
        const filename: string = body.filename || 'upload.bin';
        const mimeType: string = body.mimeType || guessMimeFromFilename(filename);
        const buf = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        const docId = body.docId || randomUUID();
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
        const docId = fields.docId || randomUUID();
        const result = await ingestTextAndStore(fields.text, docId);
        const respObj = { ok: true, file: { id: docId, name: 'text-upload.txt' }, ...result };
        console.log('[UPLOAD] Response:', JSON.stringify(respObj));
        return res.status(200).json(respObj);
      }

      // url field
      if (typeof fields.url === 'string' && fields.url.trim()) {
        const url = fields.url.trim();
        const docId = fields.docId || randomUUID();
        const resp = await fetch(url);
        if (!resp.ok) return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
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
          } catch (err) {
            console.error('[UPLOAD] PDF/Text extraction FAILED:', err);
            throw err;
          }
          // Insert file metadata into files table
          const docId = fields.docId || randomUUID();
          let fileError: any = null;
          const insertResult = await supabase.from('files').insert({
            id: docId,
            name: filename,
            size: fileSize,
            uploaded_at: new Date().toISOString(),
            doc_id: docId,
          });
          fileError = insertResult.error;
          if (fileError) {
            console.error('[UPLOAD] Error inserting file metadata:', fileError);
          } else {
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
  } catch (err: any) {
    console.error('api/upload consolidated error:', err);
    if (err && err.stack) console.error(err.stack);
    // Return the message but also include a short debug hint
    return res.status(400).json({ error: err?.message || 'Failed to process upload', hint: 'See server logs for stack and chunk previews' });
  }
}

