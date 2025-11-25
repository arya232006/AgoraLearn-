import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';

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
    // Try GPT Vision if configured. If it fails (network, timeout, model),
    // fall back to Tesseract unless the API key is missing.
    if (process.env.USE_GPT_VISION === '1') {
      try {
        console.debug('api/upload-binary: attempting OCR with GPT Vision (timeout ms=', process.env.OPENAI_REQUEST_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 30000, ')');
        const { ocrWithGptVision } = await import('../lib/vision');
        const vtxt = await ocrWithGptVision(fileBuffer, mimeType || 'image/*');
        console.debug('api/upload-binary: GPT Vision OCR completed; text length=', vtxt?.length ?? 0);
        return vtxt;
      } catch (err: any) {
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
  // Patch: Do not filter out any chunks as noise
  const rows = await Promise.all(chunks.map(async (chunk) => {
    try {
      console.debug('Embedding chunk preview:', chunk.slice(0, 120).replace(/\n/g, ' '));
      const raw = await embedText(chunk);
      const embedding = normalizeEmbedding(raw);
      return { doc_id: docId, text: chunk, embedding };
    } catch (e: any) {
      console.error('Error embedding chunk (len=' + String(chunk?.length ?? 0) + '):', e?.message ?? e);
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
    let buf: Buffer | undefined;
    if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) buf = (req as any).rawBody as Buffer;
    else if ((req as any).body && Buffer.isBuffer((req as any).body)) buf = (req as any).body as Buffer;
    // If body is a string, assume it's binary represented as latin1
    else if (typeof (req as any).body === 'string' && (req.headers['content-type'] || '').startsWith('application/octet-stream')) {
      buf = Buffer.from((req as any).body as string, 'binary');
    }

    // If still no buffer, try to read the stream into a buffer
    if (!buf) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (d: Buffer) => {
          // log small progress for debugging
          try { console.debug('api/upload-binary: receiving chunk size=', Buffer.isBuffer(d) ? d.length : 0); } catch (e) {}
          chunks.push(Buffer.from(d));
        });
        req.on('end', () => { try { console.debug('api/upload-binary: request stream end'); } catch (e) {} ; resolve(); });
        req.on('error', (e) => { console.error('api/upload-binary: request stream error', e); reject(e); });
      });
      if (chunks.length) buf = Buffer.concat(chunks);
    }

    if (!buf || buf.length === 0) return res.status(400).json({ error: 'Empty request body. Send raw binary with --data-binary @file' });

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
    let text: string | undefined;
    try {
      text = await extractTextFromBuffer(buf, filename, mimeType || undefined);
      console.debug('api/upload-binary: extractTextFromBuffer completed; text length=', text ? text.length : 0);
    } catch (e: any) {
      console.error('api/upload-binary: extractTextFromBuffer failed:', e?.message ?? e);
      console.error(e?.stack || '<no stack>');
      throw e;
    }

    console.debug('api/upload-binary: starting ingestTextAndStore');
    let result: any;
    try {
      result = await ingestTextAndStore(text as string, docId);
      console.debug('api/upload-binary: ingestTextAndStore completed; chunksInserted=', result?.chunksInserted);
    } catch (e: any) {
      console.error('api/upload-binary: ingestTextAndStore failed:', e?.message ?? e);
      console.error(e?.stack || '<no stack>');
      throw e;
    }

    return res.status(200).json({ ok: true, filename, ...result });
  } catch (err: any) {
    console.error('api/upload-binary error:', err);
    return res.status(400).json({ error: err?.message || 'Failed to process binary upload' });
  }
}
