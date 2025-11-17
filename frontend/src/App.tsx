import { useState, useRef } from "react";

function uuidv4() {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const API_BASE = "https://agora-learn-uv27.vercel.app"; // TODO: replace after backend deploy

function App() {
  const [notes, setNotes] = useState("");
  const [docId, setDocId] = useState("physics-notes-1");
  const [conversationId, setConversationId] = useState(uuidv4());
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [voiceInfo, setVoiceInfo] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [urlToUpload, setUrlToUpload] = useState("");

  async function callApi(path: string, body?: any) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      setRawResponse(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
      return data;
    } catch (e: any) {
      setError(e.message || String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function uploadNotes() {
    if (!notes.trim()) return;
    const data = await callApi("/api/upload", { text: notes, docId });
    if (data?.docId) setDocId(data.docId);
  }

  async function ask() {
    if (!question.trim()) return;
    const data = await callApi("/api/converse", { query: question, docId, conversationId });
    setAnswer(data.answer || "");
  }

  async function startVoiceAgent() {
    const data = await callApi("/api/voice/start-agent");
    const channel =
      data.channel ??
      data.properties?.channel ??
      data.properties?.token?.channel ??
      "?";
    setVoiceInfo(`Agent started in channel: ${channel}`);
  }

  async function uploadUrl() {
    if (!urlToUpload.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToUpload.trim(), docId }),
      });
      const data = await res.json();
      setRawResponse(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
      if (data?.docId) setDocId(data.docId);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function uploadFileFromInput(file?: File) {
    const f = file;
    if (!f) return;
    // Basic client-side limit (match server-side limits)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (f.size > MAX_SIZE) {
      setError('File too large. Max 10MB');
      return;
    }

    const form = new FormData();
    form.append('file', f, f.name);
    if (docId) form.append('docId', docId);

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      setRawResponse(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
      if (data?.docId) setDocId(data.docId);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadFileFromInput(f);
    // reset the input so the same file can be selected again if needed
    e.currentTarget.value = '';
  }

  // Reset conversationId when docId changes (new topic)
  function handleDocIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDocId(e.target.value);
    setConversationId(uuidv4());
  }

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", fontFamily: "system-ui" }}>
      <h2>AgoraLearn Backend Tester</h2>

      <section style={{ marginBottom: 24 }}>
        <h3>1. Upload notes</h3>
        <label>
          Doc ID: {" "}
          <input
            value={docId}
            onChange={handleDocIdChange}
            style={{ width: 220 }}
          />
        </label>
        <br />
        <textarea
          placeholder="Paste your study notes here..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          style={{ width: "100%", marginTop: 8 }}
        />
        <button onClick={uploadNotes} disabled={loading || !notes.trim()}>
          {loading ? "Uploading..." : "Upload notes"}
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>Conversation ID:</strong> {conversationId}
        </div>
        <h3>1b. Upload from URL</h3>
        <input
          placeholder="https://example.com/article"
          value={urlToUpload}
          onChange={(e) => setUrlToUpload(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button onClick={uploadUrl} disabled={loading || !urlToUpload.trim()}>
          {loading ? "Uploading..." : "Upload URL"}
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>1c. Upload file (.docx or image)</h3>
        <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} />
        <div style={{ fontSize: 13, marginTop: 8 }}>
          Supported: <strong>.docx</strong> files only in this prototype. Images and PDFs are coming soon.
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>2. Ask a question</h3>
        <input
          placeholder="What do you want to ask?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button onClick={ask} disabled={loading || !question.trim()}>
          {loading ? "Asking..." : "Ask"}
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>3. Start voice agent</h3>
        <button onClick={startVoiceAgent} disabled={loading}>
          {loading ? "Starting..." : "Start agent"}
        </button>
        {voiceInfo && (
          <div style={{ marginTop: 8 }}>
            <strong>{voiceInfo}</strong>
          </div>
        )}
      </section>

      {error && (
        <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>
          Error: {error}
        </pre>
      )}

      {answer && (
        <section style={{ marginBottom: 16 }}>
          <h3>Answer</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{answer}</pre>
        </section>
      )}

      {rawResponse && (
        <section>
          <h3>Raw response (debug)</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {rawResponse}
          </pre>
        </section>
      )}
    </div>
  );
}

export default App;
