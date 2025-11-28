"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groqChat = groqChat;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
async function groqChat(messages, temperature = 0.2) {
    const key = process.env.GROQ_API_KEY;
    if (!key)
        throw new Error('Missing GROQ_API_KEY');
    const body = {
        model: 'llama-3.1-8b-instant',
        messages,
        temperature
    };
    const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Groq error: ${res.status} ${t}`);
    }
    const json = await res.json();
    // follow similar shape to OpenAI chat completions
    const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.message ?? null;
    return content;
}
