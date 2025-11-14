import { useState } from "react";

const API_BASE = "https://agora-learn-uv27.vercel.app"; // TODO: replace after backend deploy

function App() {
  const [notes, setNotes] = useState("");
  const [docId, setDocId] = useState("physics-notes-1");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [voiceInfo, setVoiceInfo] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    await callApi("/api/upload", { text: notes, docId });
  }

  async function ask() {
    if (!question.trim()) return;
    const data = await callApi("/api/converse", { query: question });
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

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", fontFamily: "system-ui" }}>
      <h2>AgoraLearn Backend Tester</h2>

      <section style={{ marginBottom: 24 }}>
        <h3>1. Upload notes</h3>
        <label>
          Doc ID:{" "}
          <input
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
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
