**AgoraLearn — Multilingual RAG + Voice Assistant**

- **Project:**: Backend for a voice-enabled, multilingual RAG (Retrieval-Augmented Generation) assistant.
- **Stack:**: Node.js, TypeScript, Express, Supabase (vector store), OpenAI (Whisper/LLMs), `franc-min` for language detection, Lingo.dev for translations.

**Features**
- **Voice transcription:**: Upload audio to `POST /api/voice-query` (multipart/form-data) and receive a transcribed question and answer.
- **Language detection:**: Auto-detects spoken language using `franc-min` and maps ISO-639-3 -> ISO-639-1.
- **Translation:**: Uses Lingo.dev to translate user queries to English (for RAG processing) and translates answers back to the user's language.
- **RAG:**: Retrieves relevant documents from Supabase and uses a language model to generate answers.

**Quick Start (Backend)**
- **Prerequisites:**: Node 18+, npm, a Supabase project with vector embeddings, Lingo.dev API key, OpenAI API key (if used), and `.env` configured.
- **Install:**
```
cd AgoraLearn
npm install
```
- **Build:**
```
npm run build
```
- **Run (prod):**
```
npm start
```
- **Run (dev):**: Use your preferred dev runner for TypeScript or run compiled `dist` files after `npm run build`.

**Frontend (brief)**
- The companion UI lives in `AgoraLearn-UI`. Typical commands:
```
cd ../AgoraLearn-UI
npm install
npm run dev
```
- If your backend runs on a non-default port, update the fetch URL in the front end (example: `http://localhost:3001/api/voice-query`).

**Environment Variables (.env)**
- `PORT` — optional backend port (e.g. `3001`).
- `OPENAI_API_KEY` — OpenAI API key (if using OpenAI models/Whisper).
- `LINGO_API_KEY` — Lingo.dev API key for translations.
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_KEY` — Supabase anon/service role key (use service role for server-side operations).
- Any other keys used by your `api/*` modules (check `.env.example` if present).

**Key Endpoints**
- `POST /api/voice-query` — multipart/form-data (field `file`): transcribes audio, detects language, translates query (if needed), runs RAG, and returns the answer in the user's language. Response shape (JSON):
```
{
  "question": "transcribed text",
  "answer": "answer in detected language",
  "debug": { ... }
}
```
- `POST /api/converse` — application/json: send `{ "query": "...", "docId": "...", "conversationId": "..." }` (used by the UI for chat flows).

**Implementation Notes**
- Language detection: `api/detect-language.ts` wraps `franc-min` and returns a two-letter ISO code. If `franc` returns `und`, English (`en`) is used as fallback.
- Translation: `@lingo.dev/_sdk` is used via `LingoDotDevEngine`, with a context-aware call to `_localizeRaw(...)` when available.
- RAG: The backend retrieves docs from Supabase, builds context, and generates answers via the configured LLM.

**Troubleshooting**
- Error `TypeError: franc is not a function`: Fix by using the named export: `const { franc } = require('franc-min');` (this repository already includes that fix).
- If you see `STT failed` in the frontend, verify the frontend is POSTing to the correct backend URL/port and that the backend is running.
- Do NOT commit secrets. `.gitignore` excludes `dist` and other build artifacts. Use environment variables and keep secrets out of git history.

**Development Tips**
- Keep `dist/` in `.gitignore`. Commit only source files. Use `npm run build` to refresh `dist`.
- To debug language flow, check logs for `Transcribed question:` and `Detected language:` entries produced by `api/voice-query.ts`.

**License & Notes**
- This repo contains glue code connecting third-party services (Supabase, Lingo.dev, OpenAI). Verify your service usage, billing, and keys before deploying to production.

If you'd like, I can also:
- Add a `README.md` to the frontend with specific UI run instructions.
- Create a `.env.example` file listing required keys.



## Chrome Extension Usage

1. Load the extension from the `extension/` folder in Chrome (Developer mode > Load unpacked).
2. Click the extension icon on any page, type your question, and hit Send.
3. The extension extracts visible text and sends it to the backend as context.
4. Answers are generated using only the current page text (direct context mode).

**Note:** The extension sets the `x-extension` header so the backend uses direct context mode, bypassing RAG retrieval.

---

## Main App Usage

The main app (frontend) uses the full RAG pipeline:
- Questions are answered using retrieved chunks from the vector database.
- No direct context override unless the extension is used.


## Vercel Deployment Protection

If your Vercel project has Deployment Protection enabled, automated POSTs to your `api` endpoints will receive a Vercel auth page (401) unless you provide a protection bypass token. You can:
- Disable Deployment Protection in the Vercel project settings (less secure).
- Create a Protection Bypass Token in Vercel and use it in your upload scripts.

Set the token in an environment variable named `VERCEL_BYPASS_TOKEN` or pass it as an extra CLI argument to the upload scripts. The scripts will append the required query parameters automatically.

Example (PowerShell) — `.docx` upload using the `upload-docx` script:
```powershell
$env:VERCEL_BYPASS_TOKEN = 'your-token-here'
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id
Remove-Item Env:\VERCEL_BYPASS_TOKEN
```
Or pass token as CLI arg (last parameter):
```powershell
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id 'your-token-here'
```

---

## Supported uploads

- Plain text (JSON): POST `{ "text": "...", "docId": "optional" }` to `/api/upload`
- URL: POST `{ "url": "https://...", "docId": "optional" }` to `/api/upload` (server will fetch and extract text)
- Microsoft Word `.docx`: use `scripts/upload-docx.js` or multipart file upload to `/api/upload`
- PDF files: multipart upload (`.pdf`) — server extracts text and indexes content using PDF parsing (`pdf-parse`)
- Images: multipart upload (`.png`, `.jpg`, `.jpeg`) — server runs OCR (Tesseract.js) and indexes extracted text

Notes:
- PDFs and images are supported via server-side extraction/OCR. Provide high-quality scans for best OCR results.
- For large files, consider chunking before upload or increasing server upload limits.

---

## Supported document types

- Plain text files: `.txt`, `.md` (raw text / markdown)
- Structured text: `.csv` (text extraction), JSON payloads containing `"text"`
- Web pages: URLs (server fetches and extracts page text / HTML -> text)
- Microsoft Word: `.docx` (via upload script or multipart)
- PDF: `.pdf` (server-side text extraction using PDF parsing)
- Images (OCR): `.png`, `.jpg`, `.jpeg` (server-side OCR to extract text)
- Programmatic text uploads: POSTed JSON with `"text"` field

Notes:
- OCR and PDF extraction quality depend on file quality and layout.
- Large or scanned PDFs with complex layouts may require additional preprocessing.
- If you require advanced OCR or layout parsing, integrate a specialized OCR/vision service.

---

**GPT Vision vs OCR (recommendation & examples)**

- **What each does:**
  - **OCR (Tesseract / pdf-parse):** Reliable, structured text extraction for ingestion and indexing. Produces plain text you can chunk, embed, and store in Supabase. Lower cost and predictable output.
  - **GPT Vision (multimodal LLM):** Context-aware image understanding and transcription that can interpret layout, handwriting, or ambiguous content. Better for interactive QA and interpretation but higher cost and latency.

- **Recommended pattern:**
  - Use dedicated OCR (`pdf-parse` for PDFs, `tesseract.js` for images) for ingestion and indexing (RAG). This gives consistent searchable text.
  - Use GPT Vision selectively at query/QA time for richer, contextual interpretation or when OCR fails on messy inputs.
  - The codebase supports both and will automatically fall back from GPT Vision to Tesseract when GPT Vision is unavailable or errors.

- **Environment toggles:**
  - `USE_GPT_VISION=1` — try GPT Vision first for image OCR (backend will call the OpenAI Responses API). If unset or `0`, the code uses `tesseract.js` fallback.
  - `OPENAI_VISION_MODEL` — model to use for GPT Vision (e.g. `gpt-4.1-mini`).
  - Ensure `OPENAI_API_KEY` is set to use GPT Vision.

- **Quick cURL examples**

  Upload a PDF (multipart):
  ```bash
  curl -X POST "http://localhost:3001/api/upload" \
    -F "file=@/path/to/document.pdf" \
    -F "docId=my-doc-id"
  ```

  Upload an image (force GPT Vision, Bash):
  ```bash
  USE_GPT_VISION=1 OPENAI_VISION_MODEL=gpt-4.1-mini \
    curl -X POST "http://localhost:3001/api/upload" \
    -F "file=@/path/to/photo.jpg" \
    -F "docId=my-photo-doc"
  ```

  Upload an image (PowerShell):
  ```powershell
  $env:USE_GPT_VISION = '1'
  $env:OPENAI_VISION_MODEL = 'gpt-4.1-mini'
  curl -X POST "http://localhost:3001/api/upload" -F "file=@C:\path\to\photo.jpg" -F "docId=my-photo-doc"
  Remove-Item Env:\USE_GPT_VISION
  Remove-Item Env:\OPENAI_VISION_MODEL
  ```

  Base64 image upload (JSON mode):
  ```bash
  # Convert to base64 and POST as JSON (useful for scripts)
  base64 /path/to/photo.jpg | tr -d '\n' > photo.b64
  curl -X POST "http://localhost:3001/api/upload" \
    -H "Content-Type: application/json" \
    -d '{ "filename":"photo.jpg","fileBase64":"data:image/jpeg;base64,'"$(cat photo.b64)"'","docId":"img-1" }'
  ```

- **Testing tips**
  - Toggle `USE_GPT_VISION` to verify both code paths. Check server logs for `[UPLOAD] Received file:` and either `GPT Vision OCR` or `Tesseract OCR` messages.
  - For automated checks, create a small script that POSTs one sample PDF and one sample image and compares returned extracted text for non-empty responses.

---

Supabase schema (run in your DB):

```sql
create extension if not exists vector;

create table chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id text,
  text text,
  embedding vector(384),
  created_at timestamptz default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  amount numeric,
  category text,
  created_at timestamptz default now()
);

-- helper function for pgvector similarity
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int,
  doc_filter text default null
)
returns table(id uuid, doc_id text, text text, embedding vector(384), created_at timestamptz, distance float)
language sql as $$
  select id, doc_id, text, embedding, created_at, (embedding <-> query_embedding) as distance
  from chunks
  where doc_filter is null or doc_id = doc_filter
  order by distance
  limit match_count;
$$;
```
