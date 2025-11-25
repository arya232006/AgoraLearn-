import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:3000"; // Change to your backend URL


function getPageText() {
  return new Promise(resolve => {
    if (window.chrome && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_TEXT' }, function(response) {
            if (response && response.type === 'PAGE_TEXT') {
              resolve(response.text);
            } else {
              resolve('');
            }
          });
        } else {
          resolve('');
        }
      });
    } else {
      // fallback to window messaging (for dev/testing)
      window.addEventListener('message', function handler(event) {
        if (event.data && event.data.type === 'PAGE_TEXT') {
          window.removeEventListener('message', handler);
          resolve(event.data.text);
        }
      });
      window.postMessage({ type: 'GET_PAGE_TEXT' }, '*');
    }
  });
}


export default function Popup() {
  const [pageText, setPageText] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    getPageText().then(text => {
      if (!text) {
        setDebug("[DEBUG] Could not load page context.\n" +
          "- Are you on a regular website (not Chrome Web Store, new tab, or extension page)?\n" +
          "- Is content.js injected? Check the main page console for '[AgoraLearn Extension] content.js injected!'\n" +
          "- Is there a '[AgoraLearn Extension] Extracted text length:' log when you open the popup?\n" +
          "- If not, communication is broken.");
        console.warn('[AgoraLearn Extension] Could not load page context.');
      }
      setPageText(text);
    }).catch(e => {
      setDebug('[DEBUG] Error loading page context: ' + e);
      console.error('[AgoraLearn Extension] Error loading page context:', e);
    });
  }, []);

  async function sendMessage() {
    if (!input.trim()) return;
    setLoading(true);
    setMessages(msgs => [...msgs, { role: "user", content: input }]);
    const res = await fetch(`${API_BASE}/api/converse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input, context: pageText })
    });
    const data = await res.json();
    setMessages(msgs => [...msgs, { role: "assistant", content: data.answer || "(no answer)" }]);
    setInput("");
    setLoading(false);
  }

  return (
    <div className="min-w-[320px] max-w-[400px] p-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl">
      <div className="font-bold text-lg mb-2">AgoraLearn Q&A</div>
      <div className="mb-2 text-xs text-muted-foreground">
        {pageText
          ? <>Page context loaded ({pageText.length} chars)</>
          : <>Could not load page context.</>}
      </div>
      {debug && (
        <pre style={{ color: 'red', fontSize: 10, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{debug}</pre>
      )}
      <div className="flex flex-col gap-2 mb-2 max-h-48 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 rounded ${msg.role === "user" ? "bg-blue-100" : "bg-gray-100"}`}>{msg.content}</div>
        ))}
        {loading && <div className="text-xs text-gray-500">Loading...</div>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about this page..."
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
        />
        <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
