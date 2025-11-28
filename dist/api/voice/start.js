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
        const session = await (0, agora_1.createAgoraSession)();
        return res.status(200).json({ token: session.token, uid: session.uid, channelName: session.channel });
    }
    catch (err) {
        console.error('api/voice/start error:', err);
        return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
    }
}
