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
        const body = req.body || {};
        // Call helper to start agent. Body may include agent config (llm, tts, asr, etc.)
        const result = await (0, agora_1.startAgoraAgent)(body);
        return res.status(200).json(result);
    }
    catch (err) {
        console.error('api/voice/start-agent error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
