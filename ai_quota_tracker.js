'use strict';

const fs = require('fs');
const path = require('path');

const QUOTA_FILE = path.join(__dirname, 'ai_quota_usage.json');

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
  glm: {
    model: 'glm-4-plus',
    total_requests: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    last_request_time: null,
    status: 'ONLINE'
  },
  agy: {
    model: 'Antigravity 2.0 / Gemini 3.1 Pro',
    total_prompts: 0,
    last_prompt_time: null,
    status: 'ACTIVE'
  },
  recent_events: []
};

function loadQuotaData() {
  if (fs.existsSync(QUOTA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8').replace(/^\uFEFF/, ''));
      return Object.assign({}, DEFAULT_DATA, parsed);
    } catch (e) {
      console.error('[QuotaTracker] Error reading quota file:', e.message);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveQuotaData(data) {
  data.last_updated = new Date().toISOString();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[QuotaTracker] Error saving quota file:', e.message);
  }
}

function recordGroqUsage(usage = {}, headers = {}, model = 'qwen/qwen3.8-27b', promptSnippet = '') {
  const data = loadQuotaData();
  data.groq.model = model;
  data.groq.total_requests += 1;
  data.groq.last_request_time = new Date().toISOString();

  const promptTokens = usage.prompt_tokens || 0;
  const compTokens = usage.completion_tokens || 0;
  const totTokens = usage.total_tokens || (promptTokens + compTokens);

  data.groq.prompt_tokens += promptTokens;
  data.groq.completion_tokens += compTokens;
  data.groq.total_tokens += totTokens;

  // Extract rate limit headers from fetch or https response
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

  saveQuotaData(data);
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

  saveQuotaData(data);
  return data;
}

function recordGlmUsage(usage = {}, promptText = '') {
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
    snippet: (promptText || '').substring(0, 50)
  });

  if (data.recent_events.length > 20) data.recent_events.pop();

  saveQuotaData(data);
  return data;
}

function formatUsageForTelegram() {
  const data = loadQuotaData();
  const g = data.groq;
  const rl = g.rate_limit || {};
  
  const reqPct = rl.limit_requests ? Math.round((rl.remaining_requests / rl.limit_requests) * 100) : 100;
  const tokPct = rl.limit_tokens ? Math.round((rl.remaining_tokens / rl.limit_tokens) * 100) : 100;

  return `╔══════════════════════════════════╗\n` +
         `  ⚡ REAL-TIME AI USAGE & QUOTA\n` +
         `╚══════════════════════════════════╝\n\n` +
         `🤖 <b>1. Groq Fast Engine (${g.model || 'qwen/qwen3.8-27b'})</b>\n` +
         `  • Quota คำขอคงเหลือ: <b>${rl.remaining_requests || 0} / ${rl.limit_requests || 1000} (${reqPct}%)</b>\n` +
         `  • Quota Tokens คงเหลือ: <b>${(rl.remaining_tokens || 0).toLocaleString()} / ${(rl.limit_tokens || 8000).toLocaleString()} (${tokPct}%)</b>\n` +
         `  • Reset Requests ใน: ${rl.reset_requests || 'N/A'} | Tokens ใน: ${rl.reset_tokens || 'N/A'}\n` +
         `  • สะสมรวมทั้งหมด: <b>${g.total_requests} ครั้ง | ${g.total_tokens.toLocaleString()} Tokens</b>\n\n` +
         `🚀 <b>2. Google Antigravity CLI (AGY)</b>\n` +
         `  • สถานะ: 🟢 Active (Unlimited Workspace Plan)\n` +
         `  • คำสั่งประมวลผลสะสม: <b>${data.agy.total_prompts} ครั้ง</b>\n\n` +
         `🧠 <b>3. GLM AI Engine (${data.glm.model || 'glm-4-plus'})</b>\n` +
         `  • คำขอสะสม: <b>${data.glm.total_requests} ครั้ง</b> (${data.glm.total_tokens.toLocaleString()} Tokens)\n` +
         `──────────────────\n` +
         `🌐 <i>เปิดแดชบอร์ดสดบนเว็บ: http://localhost:8080/ops (แท็บ ⚡ AI Usage Quota)</i>`;
}

module.exports = {
  loadQuotaData,
  saveQuotaData,
  recordGroqUsage,
  recordAgyUsage,
  recordGlmUsage,
  formatUsageForTelegram,
  QUOTA_FILE
};
