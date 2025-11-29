"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRAG = runRAG;
const embeddings_1 = require("./embeddings");
const supabase_1 = require("./supabase");
const prompt_1 = require("../utils/prompt");
const groq_1 = require("./groq");
async function runRAG(query, topK = 10, docId, history, rawChunks) {
    let chunks = [];
    // If rawChunks is provided (extension mode), use it directly
    if (rawChunks && Array.isArray(rawChunks) && rawChunks.length > 0) {
        chunks = rawChunks.map((text, i) => ({ id: `raw-${i}`, text }));
    }
    else {
        // Ensure docId is a string, not array or stringified array
        let docIdStr = docId;
        if (Array.isArray(docIdStr)) {
            docIdStr = docIdStr.length > 0 ? String(docIdStr[0]) : undefined;
        }
        else if (typeof docIdStr !== 'string') {
            docIdStr = docIdStr !== undefined && docIdStr !== null ? String(docIdStr) : undefined;
        }
        if (docIdStr && docIdStr.startsWith('[') && docIdStr.endsWith(']')) {
            // If docId is a stringified array, parse and use first element
            try {
                const arr = JSON.parse(docIdStr);
                if (Array.isArray(arr) && arr.length > 0)
                    docIdStr = String(arr[0]);
            }
            catch { }
        }
        console.log('[RAG DEBUG] Final docId before Supabase query:', docIdStr);
        const qEmbedding = await (0, embeddings_1.embedText)(query);
        // Call a supabase RPC to match vectors (see README schema for `match_chunks` function)
        const { data, error } = await supabase_1.supabase.rpc('match_chunks', {
            query_embedding: qEmbedding,
            match_count: topK,
            doc_filter: docIdStr ?? null,
        });
        if (error)
            throw error;
        const rows = (data ?? []);
        chunks = rows
            .map((r) => ({ id: r.id, text: r.text, doc_id: r.doc_id }))
            .filter((c) => c.text && c.text.trim().length > 0);
        // Patch: If no chunks retrieved, fetch the first chunk for the docId
        if (chunks.length === 0 && docIdStr) {
            const { data: fallbackRows } = await supabase_1.supabase
                .from('chunks')
                .select('id, text, doc_id')
                .eq('doc_id', docIdStr)
                .limit(1);
            if (fallbackRows && fallbackRows.length > 0) {
                chunks = [{ id: fallbackRows[0].id, text: fallbackRows[0].text, doc_id: fallbackRows[0].doc_id }];
            }
        }
    }
    const prompt = (0, prompt_1.buildRagPrompt)(query, chunks.slice(0, topK));
    // Build messages array with history
    const messages = [
        { role: 'system', content: 'You are a helpful assistant specialized in study material.' }
    ];
    if (history && Array.isArray(history)) {
        messages.push(...history);
    }
    messages.push({ role: 'user', content: prompt });
    const answer = await (0, groq_1.groqChat)(messages, 0.2);
    return { answer, chunks };
}
