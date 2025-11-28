
import React, { useState, useRef, useEffect } from "react";
import { Spinner } from "./components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { FaUser, FaRobot, FaThumbsUp, FaThumbsDown } from "react-icons/fa";
import katex from "katex";
import "katex/dist/katex.min.css";
import './ChatApp.css';

const API_BASE = "http://localhost:3000"; // Change to your backend URL for local dev

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function ChatApp() {
  // All hooks and logic
  const [language, setLanguage] = useState('en');
  const [showAskMore, setShowAskMore] = useState(false);
  const [askMorePosition, setAskMorePosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  // ...existing code...
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder|null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Start recording
  const startRecording = async () => {
    setAudioChunks([]);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    setMediaRecorder(recorder);
    recorder.start();
    setRecording(true);
    recorder.ondataavailable = (e) => {
      setAudioChunks((chunks) => [...chunks, e.data]);
    };
    recorder.onstop = () => {
      setRecording(false);
      stream.getTracks().forEach(track => track.stop());
    };
  };

  // Stop recording and send audio to backend
  const stopRecording = async () => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    setRecording(false);
    setTimeout(async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log('AudioBlob size:', audioBlob.size, 'type:', audioBlob.type);
      if (audioBlob.size === 0) {
        alert('No audio recorded. Please try again.');
        setLoading(false);
        return;
      }
      if (audioBlob.type !== 'audio/webm') {
        alert('Audio format is not webm. Please use a supported browser.');
        setLoading(false);
        return;
      }
      const formData = new FormData();
      formData.append('audio', audioBlob, 'question.webm');
      formData.append('docId', docId);
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/voice-query`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        { role: "user", content: data.question, ts: Date.now() },
        { role: "assistant", content: data.answer || "(no answer)", ts: Date.now() }
      ]);
      setTimeout(() => {
        const chatEnd = document.getElementById("chat-end");
        if (chatEnd) chatEnd.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }, 500);
  };

  // ...existing code...

    // Listen for selection changes
    React.useEffect(() => {
      function handleSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setShowAskMore(false);
          setSelectedText("");
          return;
        }
        const text = selection.toString();
        // Only show if selection is inside an assistant answer
        const anchorNode = selection.anchorNode;
        if (anchorNode) {
          let el = anchorNode.parentElement;
          while (el && !el.classList.contains("chat-bubble")) {
            el = el.parentElement;
          }
          if (el && el.classList.contains("assistant")) {
            setSelectedText(text);
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            setAskMorePosition({ x: rect.right + window.scrollX, y: rect.bottom + window.scrollY });
            setShowAskMore(true);
            return;
          }
        }
        setShowAskMore(false);
        setSelectedText("");
      }
      document.addEventListener("selectionchange", handleSelection);
      return () => document.removeEventListener("selectionchange", handleSelection);
    }, []);

    async function handleAskMore() {
      if (!selectedText.trim()) return;
      setShowAskMore(false);
      setInput("");
      setMessages((msgs) => [...msgs, { role: "user", content: selectedText, ts: Date.now() }]);
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/converse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: selectedText, docId, conversationId }),
      });
      const data = await res.json();
      setLoading(false);
      setMessages((msgs) => {
        const newMsgs = [...msgs, { role: "assistant", content: data.answer || "(no answer)", ts: Date.now() }];
        setHistory(hist => hist.length === 0 ? [{ id: conversationId, messages: newMsgs }] : hist.map(h => h.id === conversationId ? { ...h, messages: newMsgs } : h));
        return newMsgs;
      });
      setTimeout(() => {
        const chatEnd = document.getElementById("chat-end");
        if (chatEnd) chatEnd.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  const [conversationId] = useState(uuidv4());
  const [messages, setMessages] = useState<Array<{ role: string; content: string; ts?: number; feedback?: 'up'|'down'|null }>>([]);
  const [input, setInput] = useState("");
  const [docId, setDocId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; status: string; url?: string }>>([]);
  const [theme, setTheme] = useState<'light'|'dark'>(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [history, setHistory] = useState<Array<{ id: string; messages: Array<{ role: string; content: string; ts?: number; feedback?: 'up'|'down'|null }> }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function sendMessage() {
    if (!input.trim()) return;
    setMessages((msgs) => [...msgs, { role: "user", content: input, ts: Date.now() }]);
    setInput("");
    setLoading(true);
    const res = await fetch(`${API_BASE}/api/converse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input, docId, conversationId, language }),
    });
    const data = await res.json();
    setLoading(false);
    setMessages((msgs) => {
      const newMsgs = [...msgs, { role: "assistant", content: data.answer || "(no answer)", ts: Date.now() }];
      setHistory(hist => hist.length === 0 ? [{ id: conversationId, messages: newMsgs }] : hist.map(h => h.id === conversationId ? { ...h, messages: newMsgs } : h));
      return newMsgs;
    });
    setTimeout(() => {
      const chatEnd = document.getElementById("chat-end");
      if (chatEnd) chatEnd.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadedFiles((files) => [...files, { name: file.name, status: "Uploading..." }]);
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // Guess MIME type
    const mimeType = file.type || 'application/octet-stream';
    const headers: Record<string, string> = {
      'X-Filename': file.name,
      'X-DocId': docId || '',
      'Content-Type': mimeType
    };
    const res = await fetch(`${API_BASE}/api/upload-binary`, {
      method: "POST",
      headers,
      body: arrayBuffer
    });
    const data = await res.json();
    setUploading(false);
    setUploadedFiles((files) =>
      files.map((f) =>
        f.name === file.name ? { ...f, status: res.ok ? "Uploaded" : "Error", url: data?.url } : f
      )
    );
    if (data?.docId) setDocId(data.docId);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'dark bg-background text-foreground' : 'bg-white text-black'}`}>
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border p-4">
        <Card>
          <CardHeader>
            <CardTitle>AgoraLearn</CardTitle>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? '🌞 Light' : '🌙 Dark'}
              </Button>
            </div>
          </CardHeader>
          <div className="mt-4">
            <div className="font-semibold mb-2">Chat History</div>
            <div className="space-y-2">
              {history.map(h => (
                <Button key={h.id} variant="ghost" size="sm" onClick={() => { setMessages(h.messages); }}>
                  {h.id.slice(0, 8)}... ({h.messages.length} msgs)
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </aside>
      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 md:p-8">
        <Card className="chat-app modern-chat w-full max-w-xl mx-auto shadow-lg rounded-xl p-6">
          <div className="chat-header flex items-center justify-between">
            <span>AgoraLearn Chat</span>
            <Button variant="secondary" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '🌞' : '🌙'}
            </Button>
          </div>
          <div className="chat-files">
            <label htmlFor="doc-id-input" className="doc-id-label flex items-center gap-2">
              Doc ID:
              <Input id="doc-id-input" value={docId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDocId(e.target.value)} className="max-w-xs" />
            </label>
            <Input
              type="file"
              accept=".docx,.pdf,image/*"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={uploading}
              className="mt-2 max-w-xs"
            />
            {uploading && <Spinner className="upload-spinner" />}
            <div className="chat-file-list">
              {uploadedFiles.map(f => (
                <div key={f.name} className="chat-file-item flex items-center gap-2">
                  {f.url && f.url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                    <img src={f.url} alt={f.name} className="w-8 h-8 rounded object-cover" />
                  ) : null}
                  <span>{f.name}</span> <span>({f.status})</span>
                </div>
              ))}
            </div>
          </div>
          <div className="chat-messages" style={{ position: 'relative' }}>
            <TooltipProvider>
              {messages.map((msg, i) => {
                const latexRegex = /\$\$(.*?)\$\$|\$(.*?)\$/gs;
                let rendered = msg.content;
                if (latexRegex.test(msg.content)) {
                  rendered = msg.content.replace(latexRegex, (match, p1, p2) => {
                    try {
                      return katex.renderToString(p1 || p2, { displayMode: !!p1 });
                    } catch (e) {
                      return match;
                    }
                  });
                }
                return (
                  <div
                    key={i}
                    className={`chat-bubble flex flex-col gap-1${msg.role === 'assistant' ? ' assistant' : ''}${msg.role === 'user' ? ' user' : ''}`}
                  >
                    <div className="chat-meta flex items-center gap-2">
                      <Avatar>
                        <AvatarImage src={msg.role === "user" ? undefined : undefined} />
                        <AvatarFallback>{msg.role === "user" ? <FaUser /> : <FaRobot />}</AvatarFallback>
                      </Avatar>
                      <span className="chat-timestamp text-xs text-muted-foreground">{msg.ts ? new Date(msg.ts).toLocaleTimeString() : ''}</span>
                    </div>
                    <span dangerouslySetInnerHTML={{ __html: rendered }} />
                    <div className="chat-feedback flex gap-2 mt-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setMessages(msgs => msgs.map((m, idx) => idx === i ? { ...m, feedback: 'up' } : m))}>
                            <FaThumbsUp color={msg.feedback === 'up' ? '#198754' : '#888'} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Helpful</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setMessages(msgs => msgs.map((m, idx) => idx === i ? { ...m, feedback: 'down' } : m))}>
                            <FaThumbsDown color={msg.feedback === 'down' ? '#dc3545' : '#888'} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Not helpful</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
              {showAskMore && askMorePosition && (
                <button
                  style={{
                    position: 'absolute',
                    left: askMorePosition.x,
                    top: askMorePosition.y,
                    zIndex: 1000,
                    background: '#fff',
                    border: '1px solid #888',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                  }}
                  onClick={handleAskMore}
                >
                  Ask more
                </button>
              )}
              {loading && <Spinner className="ai-spinner" />}
              <div id="chat-end" />
            </TooltipProvider>
          </div>
          <div className="chat-input-row sticky-input flex gap-2 mt-2">
            {/* Voice Q&A Controls */}
            <Button
              variant={recording ? "destructive" : "secondary"}
              onClick={recording ? stopRecording : startRecording}
              disabled={loading}
            >
              {recording ? "Stop Recording" : "Ask by Voice"}
            </Button>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginRight: '8px' }}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="hi">Hindi</option>
              <option value="zh">Chinese</option>
              <option value="ar">Arabic</option>
              <option value="ru">Russian</option>
              <option value="ja">Japanese</option>
              <option value="pt">Portuguese</option>
              {/* Add more languages as needed */}
            </select>
            <Input
              className="chat-input flex-1"
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              placeholder="Type your question..."
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") sendMessage(); }}
            />
            <Button className="chat-send" onClick={sendMessage} disabled={!input.trim() || loading}>Send</Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
