"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
const rag_1 = require("../lib/rag");
const formidable_1 = __importDefault(require("formidable"));
const fs_1 = __importDefault(require("fs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const form_data_1 = __importDefault(require("form-data"));
exports.config = {
    api: {
        bodyParser: false,
    },
};
async function transcribeAudio(filePath) {
    const apiKey = process.env.OPENAI_API_KEY;
    const formData = new form_data_1.default();
    formData.append('file', fs_1.default.createReadStream(filePath), { filename: 'audio.webm' });
    formData.append('model', 'whisper-1');
    const response = await (0, node_fetch_1.default)('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
    });
    const data = await response.json();
    return data.text || '';
}
async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const form = (0, formidable_1.default)({ multiples: false });
    form.parse(req, async (err, fields, files) => {
        if (err || !files.audio) {
            return res.status(400).json({ error: 'Audio file required' });
        }
        const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
        const filePath = audioFile.filepath || audioFile.path;
        try {
            const question = await transcribeAudio(filePath);
            console.log('Transcribed question:', question);
            // Ensure docId is a string, not array
            let docId = fields.docId;
            // Normalize docId to string if array or other type
            if (Array.isArray(docId)) {
                docId = docId.length > 0 ? String(docId[0]) : undefined;
            }
            else if (typeof docId !== 'string') {
                docId = docId !== undefined && docId !== null ? String(docId) : undefined;
            }
            if (docId && docId.startsWith('[') && docId.endsWith(']')) {
                // If docId is a stringified array, parse and use first element
                try {
                    const arr = JSON.parse(docId);
                    if (Array.isArray(arr) && arr.length > 0)
                        docId = String(arr[0]);
                }
                catch { }
            }
            console.log('[VOICE-QUERY DEBUG] Final docId before runRAG:', docId);
            // runRAG expects: query, topK, docId
            const answerObj = await (0, rag_1.runRAG)(question, 10, docId);
            console.log('RAG answer:', answerObj);
            return res.status(200).json({ question, answer: answerObj?.answer, debug: { question, answerObj } });
        }
        catch (e) {
            console.error('Voice query error:', e);
            return res.status(500).json({ error: 'Failed to process audio', details: typeof e === 'object' && e !== null && 'message' in e ? e.message : String(e) });
        }
    });
}
