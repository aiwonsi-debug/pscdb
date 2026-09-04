// AI Quota & Usage Tracker with Loop-Safe Sync
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const QUOTA_FILE = path.join(__dirname, 'ai_quota_usage.json');
let envApiKey = (process.env.PSC_API_KEY || '').trim();
const secCfgPath = path.join(__dirname, 'line_config.json');
if (!envApiKey && fs.existsSync(secCfgPath)) {
  try {
    const sc = JSON.parse(fs.readFileSync(secCfgPath, 'utf8').replace(/^\uFEFF/, ''));
    envApiKey = (sc.api_key || sc.PSC_API_KEY || '').trim();
  } catch (e) {}
}
const PSC_API_KEY = envApiKey;
const RENDER_DASHBOARD_URL = process.env.RENDER_DASHBOARD_URL || 'https://pscdb.onrender.com';

const DEFAULT_DATA = {
  last_updated: new Date().toISOString(),
  groq: {
    model: 'qwen/qwen3.8-27b',
    total_requests: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    last_request_time: null,
    rate_limit: {
      limit_requests: 1000,
      remaining_requests: 1000,
      limit_tokens: 8000,
      remaining_tokens: 8000,
      reset_requests: '1m',
      reset_tokens: '1s'
    }
  },
  agy: {
    account: 'aiwonsi@gmail.com',
    gemini: {
      models: 'Gemini Flash, Gemini Pro',
      weekly_remaining_pct: 92.16,
      weekly_refresh: '165h 57m',
      five_hour_remaining_pct: 70.22,
      five_hour_refresh: '3h 58m'
    },
    claude_gpt: {
      models: 'Claude Opus, Claude Sonnet, GPT-OSS',
      weekly_remaining_pct: 0.0,
      weekly_refresh: '145h 42m',
      five_hour_remaining_pct: 0.0,
      five_hour_status: 'Weekly limit reached'
    },
    total_prompts: 0,
    last_prompt_time: null,
    status: 'ACTIVE'
  },
  glm: {
    model: 'glm-4-plus',
    total_requests: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    last_request_time: null,
    status: 'ONLINE'
  },
  recent_events: []
};

function loadQuotaData() {
  if (fs.existsSync(QUOTA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8').replace(/^\uFEFF/, ''));
      const merged = Object.assign({}, DEFAULT_DATA, parsed);
      if (!merged.agy || !merged.agy.gemini) {
        merged.agy = Object.assign({}, DEFAULT_DATA.agy, merged.agy || {});
      }
      return merged;
    } catch (e) {
      console.error('[QuotaTracker] Error reading quota file:', e.message);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function syncQuotaToRender(data) {
  if (!RENDER_DASHBOARD_URL || process.env.IS_RENDER_SERVER === 'true') return;
  try {
    const postData = JSON.stringify(data);
    const parsed = url.parse(RENDER_DASHBOARD_URL + '/api/sync-quota');
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-PSC-API-KEY': PSC_API_KEY
      },
      timeout: 8000
    }, () => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch(e) {}
}

function saveQuotaData(data, shouldSync = true) {
  data.last_updated = new Date().toISOString();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), 'utf8');
    if (shouldSync) {
      syncQuotaToRender(data);
    }
  } catch (e) {
    console.error('[QuotaTracker] Error saving quota file:', e.message);
  }
}

function recordGroqUsage(usage = {}, headers = null, model = 'qwen/qwen3.8-27b', promptSnippet = '') {
  const data = loadQuotaData();
  data.groq.total_requests += 1;
  data.groq.last_request_time = new Date().toISOString();
  data.groq.model = model;

  const promptTokens = usage.prompt_tokens || 0;
  const compTokens = usage.completion_tokens || 0;
  const totTokens = usage.total_tokens || (promptTokens + compTokens);

  data.groq.prompt_tokens += promptTokens;
  data.groq.completion_tokens += compTokens;
  data.groq.total_tokens += totTokens;

  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name.toLowerCase()] || headers[name];
  };

  const limitReq = getHeader('x-ratelimit-limit-requests');
  const remReq = getHeader('x-ratelimit-remaining-requests');
  const limitTok = getHeader('x-ratelimit-limit-tokens');
  const remTok = getHeader('x-ratelimit-remaining-tokens');
  const resetReq = getHeader('x-ratelimit-reset-requests');
  const resetTok = getHeader('x-ratelimit-reset-tokens');

  if (limitReq !== undefined && limitReq !== null) data.groq.rate_limit.limit_requests = parseInt(limitReq, 10) || data.groq.rate_limit.limit_requests;
  if (remReq !== undefined && remReq !== null) data.groq.rate_limit.remaining_requests = parseInt(remReq, 10) || 0;
  if (limitTok !== undefined && limitTok !== null) data.groq.rate_limit.limit_tokens = parseInt(limitTok, 10) || data.groq.rate_limit.limit_tokens;
  if (remTok !== undefined && remTok !== null) data.groq.rate_limit.remaining_tokens = parseInt(remTok, 10) || 0;
  if (resetReq) data.groq.rate_limit.reset_requests = resetReq;
  if (resetTok) data.groq.rate_limit.reset_tokens = resetTok;

  data.recent_events.unshift({
    timestamp: new Date().toISOString(),
    engine: 'Groq',
    model: model,
    tokens: totTokens,
    snippet: (promptSnippet || '').substring(0, 50)
  });

  if (data.recent_events.length > 20) data.recent_events.pop();

  saveQuotaData(data, true);
  return data;
}

function updateAgyQuota(quotaUpdate = {}) {
  const data = loadQuotaData();
  if (quotaUpdate.gemini) {
    data.agy.gemini = Object.assign(data.agy.gemini, quotaUpdate.gemini);
  }
  if (quotaUpdate.claude_gpt) {
    data.agy.claude_gpt = Object.assign(data.agy.claude_gpt, quotaUpdate.claude_gpt);
  }
  if (quotaUpdate.account) {
    data.agy.account = quotaUpdate.account;
  }
  saveQuotaData(data, true);
  return data;
}

function recordAgyUsage(promptText = '') {
  const data = loadQuotaData();
  data.agy.total_prompts += 1;
  data.agy.last_prompt_time = new Date().toISOString();

  data.recent_events.unshift({
    timestamp: new Date().toISOString(),
    engine: 'AGY CLI',
    model: 'Antigravity Direct',
    tokens: null,
    snippet: (promptText || '').substring(0, 50)
  });

  if (data.recent_events.length > 20) data.recent_events.pop();

  saveQuotaData(data, true);
  return data;
}

function recordGlmUsage(usage = {}, promptSnippet = '') {
  const data = loadQuotaData();
  data.glm.total_requests += 1;
  data.glm.last_request_time = new Date().toISOString();

  const promptTokens = usage.prompt_tokens || 0;
  const compTokens = usage.completion_tokens || 0;
  const totTokens = usage.total_tokens || (promptTokens + compTokens);

  data.glm.prompt_tokens += promptTokens;
  data.glm.completion_tokens += compTokens;
  data.glm.total_tokens += totTokens;

  data.recent_events.unshift({
    timestamp: new Date().toISOString(),
    engine: 'GLM',
    model: data.glm.model || 'glm-4-plus',
    tokens: totTokens,
    snippet: (promptSnippet || '').substring(0, 50)
  });

  if (data.recent_events.length > 20) data.recent_events.pop();

  saveQuotaData(data, true);
  return data;
}



function formatUsageForTelegram() {
  const data = loadQuotaData();
  const g = data.groq;
  const rl = g.rate_limit || {};
  const agy = data.agy || {};
  const gem = agy.gemini || {};
  const cg = agy.claude_gpt || {};
  
  const reqPct = rl.limit_requests ? Math.round((rl.remaining_requests / rl.limit_requests) * 100) : 100;
  const tokPct = rl.limit_tokens ? Math.round((rl.remaining_tokens / rl.limit_tokens) * 100) : 100;

  const gemWeek = gem.weekly_remaining_pct !== undefined ? gem.weekly_remaining_pct : 81.08;
  const gemFive = gem.five_hour_remaining_pct !== undefined ? gem.five_hour_remaining_pct : 0.00;
  const cgWeek = cg.weekly_remaining_pct !== undefined ? cg.weekly_remaining_pct : 0.00;

  return [
    '⚡ <b>AI QUOTA & RATE LIMIT STATUS</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '🚀 <b>Google Antigravity CLI (AGY)</b>',
    '• <b>บัญชี:</b> <code>' + (agy.account || 'aiwonsi@gmail.com') + '</code>',
    '• <b>Gemini (Flash / Pro):</b>',
    '  └ สัปดาห์: <b>' + gemWeek + '%</b> (' + (gem.weekly_refresh || '162h 59m') + ')',
    '  └ 5 ชั่วโมง: <b>' + gemFive + '%</b> (' + (gem.five_hour_refresh || '1h 0m') + ')',
    '• <b>Claude / GPT (Sonnet/Opus):</b>',
    '  └ สัปดาห์: <b>' + cgWeek + '%</b> (รีเฟรช ' + (cg.weekly_refresh || '142h 44m') + ')',
    '  └ สถานะ: ⚠️ ' + (cg.five_hour_status || 'Weekly limit reached'),
    '• <b>เรียกใช้สะสม:</b> ' + (agy.total_prompts || 0) + ' ครั้ง',
    '',
    '🤖 <b>Groq Fast API (Auto-Failover)</b>',
    '• <b>โมเดล:</b> <code>' + (g.model || 'qwen/qwen3.8-27b') + '</code>',
    '• <b>คำขอคงเหลือ:</b> <b>' + (rl.remaining_requests || 0) + ' / ' + (rl.limit_requests || 1000) + '</b> (' + reqPct + '%)',
    '• <b>Tokens คงเหลือ:</b> <b>' + (rl.remaining_tokens || 0).toLocaleString() + ' / ' + (rl.limit_tokens || 8000).toLocaleString() + '</b> (' + tokPct + '%)',
    '• <b>เรียกใช้สะสม:</b> ' + (g.total_requests || 0) + ' ครั้ง (' + (g.total_tokens || 0).toLocaleString() + ' tok)',
    '━━━━━━━━━━━━━━━━━━━━',
    '📱 <i>สถานะโควต้า AI พร้อมใช้งานตลอด 24 ชม.</i>'
  ].join('\n');
}

module.exports = {
  loadQuotaData,
  saveQuotaData,
  recordGroqUsage,
  recordAgyUsage,
  updateAgyQuota,
  recordGlmUsage,
  formatUsageForTelegram,
  QUOTA_FILE
};
