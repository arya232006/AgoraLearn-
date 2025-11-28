"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const agora_1 = require("../../lib/agora");
async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        const body = req.body ?? {};
        const text = typeof body.text === 'string' ? body.text : undefined;
        if (!text)
            return res.status(400).json({ error: 'Missing required field: text' });
        try {
            const result = await (0, agora_1.agoraTTS)(text);
            const audioBuffer = result.buffer;
            const contentType = result.contentType || 'audio/wav';
            return res.status(200).json({ audioBase64: audioBuffer.toString('base64'), contentType });
        }
        catch (err) {
            console.error('Upstream Agora TTS error:', err);
            return res.status(502).json({ error: 'Upstream TTS error', details: err?.message ?? String(err) });
        }
    }
    catch (err) {
        console.error('api/voice/tts error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
