"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const agora_1 = require("../../lib/agora");
const rag_1 = require("../../lib/rag");
async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        const body = req.body ?? {};
        const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
        if (!audioBase64)
            return res.status(400).json({ error: 'Missing audioBase64' });
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        try {
            const transcript = await (0, agora_1.agoraSTT)(audioBuffer);
            const { answer } = await (0, rag_1.runRAG)(transcript);
            const ttsResult = await (0, agora_1.agoraTTS)(answer);
            return res.status(200).json({ textAnswer: answer, audioBase64: ttsResult.buffer.toString('base64'), contentType: ttsResult.contentType });
        }
        catch (err) {
            console.error('api/voice/converse upstream error:', err);
            return res.status(502).json({ error: 'Upstream error', details: err?.message ?? String(err) });
        }
    }
    catch (err) {
        console.error('api/voice/converse error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
