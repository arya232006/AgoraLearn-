"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const rag_1 = require("../lib/rag");
const safeParse_1 = require("../utils/safeParse");
const supabase_1 = require("../lib/supabase");
const franc_1 = require("franc"); // Language detection
const node_fetch_1 = __importDefault(require("node-fetch")); // For Lingo.dev API calls
async function detectLanguage(text) {
    // Use franc to detect language code (ISO 639-1)
    const lang = (0, franc_1.franc)(text);
    // Map franc codes to ISO 639-1 if needed
    if (lang === 'und')
        return 'en';
    return lang;
}
async function lingoTranslate(text, targetLang) {
    // Replace with actual Lingo.dev API endpoint and key
    const apiKey = process.env.LINGO_API_KEY;
    const response = await (0, node_fetch_1.default)('https://api.lingo.dev/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text, targetLang }),
    });
    const data = await response.json();
    return data.translatedText || text;
}
async function handler(req, res) {
    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-DocId');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    // Diagnostic logs: headers and body preview to help debug parsing issues
    try {
        console.debug('api/converse headers=', req.headers);
        console.debug('api/converse content-type=', String(req.headers['content-type'] || ''));
        try {
            const preview = typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 1000) : String(req.body).slice(0, 1000);
            console.debug('api/converse body preview=', preview);
        }
        catch (e) {
            console.debug('api/converse body preview: <unavailable>');
        }
    }
    catch (e) {
        console.debug('api/converse logging error', String(e));
    }
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        // Parse request
        const parsed = (await (0, safeParse_1.safeParseJson)(req)) ?? req.body;
        const query = parsed?.query;
        const docId = parsed?.docId;
        const conversationId = parsed?.conversationId;
        const context = parsed?.context;
        const translate = parsed?.translate;
        if (translate && translate.text && translate.targetLang) {
            // Handle translation request
            const translated = await lingoTranslate(translate.text, translate.targetLang);
            return res.status(200).json({ translated });
        }
        if (!query) {
            return res.status(400).json({ error: 'Missing query' });
        }
        // Detect input language
        const inputLang = await detectLanguage(query);
        // Run RAG pipeline
        const { answer, chunks } = await (0, rag_1.runRAG)(query, 5, docId, []);
        // Translate answer to input language if needed
        let finalAnswer = answer;
        if (inputLang !== 'en') {
            finalAnswer = await lingoTranslate(answer, inputLang);
        }
        // Store user query and assistant reply in messages table if conversationId is provided
        if (conversationId) {
            // Store user message
            await supabase_1.supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'user',
                content: query
            });
            // Store assistant reply
            await supabase_1.supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: finalAnswer
            });
        }
        return res.status(200).json({ answer: finalAnswer, chunks, inputLang });
    }
    catch (err) {
        console.error('api/converse error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
