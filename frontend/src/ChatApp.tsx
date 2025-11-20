import React, { useState, useRef } from "react";
import './ChatApp.css';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function ChatApp() {
  const [conversationId] = useState(uuidv4());
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [docId, setDocId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; status: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function sendMessage() {
    if (!input.trim()) return;
    setMessages((msgs) => [...msgs, { role: "user", content: input }]);
    setInput("");
    const res = await fetch("/api/converse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input, docId, conversationId }),
    });
    const data = await res.json();
    setMessages((msgs) => [...msgs, { role: "assistant", content: data.answer || "(no answer)" }]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadedFiles((files) => [...files, { name: file.name, status: "Uploading..." }]);
    const form = new FormData();
    form.append("file", file, file.name);
    if (docId) form.append("docId", docId);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    setUploadedFiles((files) =>
      files.map((f) =>
        f.name === file.name ? { ...f, status: res.ok ? "Uploaded" : "Error" } : f
      )
    );
    if (data?.docId) setDocId(data.docId);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="chat-app">
      <div className="chat-header">AgoraLearn Chat</div>
      <div className="chat-files">
        <label>
          Doc ID:
          <input value={docId} onChange={e => setDocId(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        <input
          type="file"
          accept=".docx,.pdf,image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          disabled={uploading}
        />
        <div className="chat-file-list">
          {uploadedFiles.map(f => (
            <div key={f.name} className="chat-file-item">{f.name} <span>({f.status})</span></div>
          ))}
        </div>
      </div>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={"chat-bubble " + (msg.role === "user" ? "user" : "assistant")}>{msg.content}</div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your question..."
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
        />
        <button className="chat-send" onClick={sendMessage} disabled={!input.trim()}>Send</button>
      </div>
    </div>
  );
}
