const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

require('dotenv').config();
const apiKey = process.env.OPENAI_API_KEY;
const formData = new FormData();
formData.append('file', fs.createReadStream('sample.m4a'));
formData.append('model', 'whisper-1');

fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
  },
  body: formData
})
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
