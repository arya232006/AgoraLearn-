"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const rag_1 = require("../lib/rag");
const safeParse_1 = require("../utils/safeParse");
const supabase_1 = require("../lib/supabase");
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
        const parsed = (await (0, safeParse_1.safeParseJson)(req)) ?? req.body;
        const query = parsed?.query;
        const docId = parsed?.docId;
        const conversationId = parsed?.conversationId;
        const context = parsed?.context;
        if (!query) {
            return res.status(400).json({ error: 'Missing query' });
        }
        // Fetch conversation history if conversationId is provided
        let history = [];
        if (conversationId) {
            const { data: messages, error } = await supabase_1.supabase
                .from('messages')
                .select('role,content')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });
            if (error) {
                console.error('Supabase fetch messages error:', error);
            }
            else if (messages) {
                history = messages.map((m) => ({ role: m.role, content: m.content }));
            }
        }
        // If request is from extension (x-extension header), use provided context directly
        const isExtension = req.headers['x-extension'] === '1';
        if (isExtension && context && typeof context === 'string' && context.trim().length > 0) {
            const { answer } = await (0, rag_1.runRAG)(query, 1, undefined, history, [context]);
            return res.status(200).json({ answer });
        }
        // Run RAG with history (normal pipeline)
        const { answer, chunks } = await (0, rag_1.runRAG)(query, 5, docId, history);
        // Debug: log retrieved chunks
        console.debug('Retrieved chunks for query:', query);
        chunks.forEach((c, idx) => {
            console.debug(`Chunk ${idx + 1}:`, c.text.slice(0, 200));
        });
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
                content: answer
            });
        }
        return res.status(200).json({ answer, chunks });
    }
    catch (err) {
        console.error('api/converse error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
