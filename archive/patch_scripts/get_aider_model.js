// E:/agy/get_aider_model.js
'use strict';
const https = require('https');

const OKMD_KEY = process.env.OKMD_API_KEY || 'YOUR_OKMD_API_KEY_HERE';
const GROQ_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY_HERE';

function testOkmd() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: '1' }]
    });

    const req = https.request('https://gen.ai.kku.ac.th/okmd/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OKMD_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 4000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // If code 402 or error returned from OpenRouter upstream
          if (json.status === 402 || json.code === 402 || json.error) {
            resolve(false);
          } else if (res.statusCode === 200 && json.choices) {
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(postData);
    req.end();
  });
}

async function run() {
  const okmdWorking = await testOkmd();
  if (okmdWorking) {
    // Return OKMD
    process.stdout.write('https://gen.ai.kku.ac.th/okmd/api/v1|' + OKMD_KEY + '|openai/gpt-5.4|GPT-5.4 (OKMD)|Available');
  } else {
    // Failover to Groq Fast Engine (Qwen 3.8 27B)
    process.stdout.write('https://api.groq.com/openai/v1|' + GROQ_KEY + '|openai/qwen/qwen3.8-27b|Groq Qwen 3.8 27B (Auto-Failover)|Active');
  }
}

run();
