// AI Quota & Usage Tracker with Loop-Safe Sync (bloat‑reduced)
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const QUOTA_FILE = process.env.AI_QUOTA_USAGE_FILE || path.join(__dirname, 'ai_quota_usage.json');
const PSC_API_KEY = (process.env.PSC_API_KEY || '').trim();
const RENDER_DASHBOARD_URL = process.env.RENDER_DASHBOARD_URL || 'https://pscdb.onrender.com';

function formatPct(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00%';
  return num.toFixed(2) + '%';
}

// True defaults only — no live/runtime data hardcoded here.
// Real numbers should come from the persisted QUOTA_FILE or from updateAgyQuota() calls.
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
      weekly_remaining_pct: 100,
      weekly_refresh: '168h 0m',
      five_hour_remaining_pct: 100,
      five_hour_refresh: '5h 0m'
    },
    claude_gpt: {
      models: 'Claude Opus, Claude Sonnet, GPT-OSS',
      weekly_remaining_pct: 100,
      weekly_refresh: '168h 0m',
      five_hour_remaining_pct: 100,
      five_hour_status: 'OK'
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
  okmd: {
    model: 'deepseek-v4-pro',
    provider: 'Deepseek',
    total_requests: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    daily_quota_tokens: 180000,
    daily_remaining_tokens: 180000,
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

// -----------------  helper to reduce duplication  -----------------

function _applyUsageData(modifyFn) {
  const data = loadQuotaData();
  modifyFn(data);
  saveQuotaData(data, true);
  return data;
}

function _appendRecentEvent(data, engine, model, tokens, snippet) {
  data.recent_events.unshift({
    timestamp: new Date().toISOString(),
    engine,
    model,
    tokens,
    snippet: (snippet || '').substring(0, 50)
  });
  if (data.recent_events.length > 20) {
    data.recent_events.pop();
  }
}

// Shared token-accounting logic used by recordGroqUsage / recordGlmUsage / recordOkmdUsage
function _computeTokenTotals(usage = {}) {
  const promptTokens = usage.prompt_tokens || 0;
  const compTokens = usage.completion_tokens || 0;
  const totTokens = usage.total_tokens || (promptTokens + compTokens);
  return { promptTokens, compTokens, totTokens };
}

function _accumulateEngineTokens(bucket, tokenTotals) {
  bucket.prompt_tokens += tokenTotals.promptTokens;
  bucket.completion_tokens += tokenTotals.compTokens;
  bucket.total_tokens += tokenTotals.totTokens;
}

function _getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name.toLowerCase()] || headers[name];
}

// -----------------  record functions  -----------------

function recordGroqUsage(usage = {}, headers = null, model = 'qwen/qwen3.8-27b', promptSnipppet = '') {
  return _applyUsageData((data) => {
    data.groq.total_requests += 1;
    data.groq.last_request_time = new Date().toISOString();
    data.groq.model = model;

    const tokenTotals = _computeTokenTotals(usage);
    _accumulateEngineTokens(data.groq, tokenTotals);

    const limitReq = _getHeader(headers, 'x-ratelimit-limit-requests');
    const remReq = _getHeader(headers, 'x-ratelimit-remaining-requests');
    const limitTok = _getHeader(headers, 'x-ratelimit-limit-tokens');
    const remTok = _getHeader(headers, 'x-ratelimit-remaining-tokens');
    const resetReq = _getHeader(headers, 'x-ratelimit-reset-requests');
    const resetTok = _getHeader(headers, 'x-ratelimit-reset-tokens');

    if (limitReq !== undefined && limitReq !== null) data.groq.rate_limit.limit_requests = parseInt(limitReq, 10) || data.groq.rate_limit.limit_requests;
    if (remReq !== undefined && remReq !== null) data.groq.rate_limit.remaining_requests = parseInt(remReq, 10) || 0;
    if (limitTok !== undefined && limitTok !== null) data.groq.rate_limit.limit_tokens = parseInt(limitTok, 10) || data.groq.rate_limit.limit_tokens;
    if (remTok !== undefined && remTok !== null) data.groq.rate_limit.remaining_tokens = parseInt(remTok, 10) || 0;
    if (resetReq) data.groq.rate_limit.reset_requests = resetReq;
    if (resetTok) data.groq.rate_limit.reset_tokens = resetTok;

    _appendRecentEvent(data, 'Groq', model, tokenTotals.totTokens, promptSnipppet);
  });
}

function updateAgyQuota(quotaUpdate = {}) {
  return _applyUsageData((data) => {
    if (quotaUpdate.gemini) {
      data.agy.gemini = Object.assign(data.agy.gemini, quotaUpdate.gemini);
    }
    if (quotaUpdate.claude_gpt) {
      data.agy.claude_gpt = Object.assign(data.agy.claude_gpt, quotaUpdate.claude_gpt);
    }
    if (quotaUpdate.account) {
      data.agy.account = quotaUpdate.account;
    }
    // no event appended for quota update
  });
}

function recordAgyUsage(promptText = '') {
  return _applyUsageData((data) => {
    data.agy.total_prompts += 1;
    data.agy.last_prompt_time = new Date().toISOString();
    _appendRecentEvent(data, 'AGY CLI', 'Antigravity Direct', null, promptText);
  });
}

function recordGlmUsage(usage = {}, promptSnippet = '') {
  return _applyUsageData((data) => {
    data.glm.total_requests += 1;
    data.glm.last_request_time = new Date().toISOString();

    const tokenTotals = _computeTokenTotals(usage);
    _accumulateEngineTokens(data.glm, tokenTotals);

    _appendRecentEvent(data, 'GLM', data.glm.model || 'glm-4-plus', tokenTotals.totTokens, promptSnippet);
  });
}

function recordOkmdUsage(usage = {}, modelQuota = {}, model = 'deepseek-v4-pro', provider = 'Deepseek', promptSnippet = '') {
  return _applyUsageData((data) => {
    if (!data.okmd) {
      data.okmd = {
        model: model,
        provider: provider,
        total_requests: 0,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        daily_quota_tokens: 180000,
        daily_remaining_tokens: 180000,
        last_request_time: null,
        status: 'ONLINE'
      };
    }
    data.okmd.total_requests += 1;
    data.okmd.last_request_time = new Date().toISOString();
    data.okmd.model = model;
    data.okmd.provider = provider;

    const tokenTotals = _computeTokenTotals(usage);
    _accumulateEngineTokens(data.okmd, tokenTotals);

    if (modelQuota.daily_quota_tokens) data.okmd.daily_quota_tokens = modelQuota.daily_quota_tokens;
    if (modelQuota.daily_remaining_tokens !== undefined) data.okmd.daily_remaining_tokens = modelQuota.daily_remaining_tokens;

    _appendRecentEvent(data, 'OKMD', model, tokenTotals.totTokens, promptSnippet);
  });
}

function formatUsageForTelegram() {
  const data = loadQuotaData();
  const okmd = data.okmd || {};
  const g = data.groq;
  const rl = g.rate_limit || {};
  const agy = data.agy || {};
  const gem = agy.gemini || {};
  const cg = agy.claude_gpt || {};

  const tokPct = rl.limit_tokens ? Math.round((rl.remaining_tokens / rl.limit_tokens) * 100) : 100;

  const gemWeek = gem.weekly_remaining_pct !== undefined ? gem.weekly_remaining_pct : 100;
  const gemFive = gem.five_hour_remaining_pct !== undefined ? gem.five_hour_remaining_pct : 100;
  const cgWeek = cg.weekly_remaining_pct !== undefined ? cg.weekly_remaining_pct : 100;

  const okmdRemaining = okmd.daily_remaining_tokens !== undefined ? okmd.daily_remaining_tokens : 180000;
  const okmdTotal = okmd.daily_quota_tokens || 180000;
  const okmdPct = Math.round((okmdRemaining / okmdTotal) * 100);

  return [
    '⚡ <b>AI QUOTA & RATE LIMIT STATUS</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '👑 <b>OKMD Playground API (Primary Engine)</b>',
    '• <b>โมเดลหลัก:</b> <code>' + (okmd.model || 'claude-sonnet-5') + '</code> (' + (okmd.provider || 'Claude') + ')',
    '• <b>Tokens คงเหลือวันนี้:</b> <b>' + okmdRemaining.toLocaleString() + ' / ' + okmdTotal.toLocaleString() + '</b> (' + okmdPct + '%)',
    '• <b>เรียกใช้สะสม:</b> ' + (okmd.total_requests || 0) + ' ครั้ง (' + (okmd.total_tokens || 0).toLocaleString() + ' tok)',
    '• <b>สถานะ:</b> 🟢 ' + (okmd.status || 'ONLINE (Active)'),
    '',
    '🚀 <b>Google Antigravity CLI (AGY)</b>',
    '• <b>บัญชี:</b> <code>' + (agy.account || 'aiwonsi@gmail.com') + '</code>',
    '• <b>Gemini (Flash / Pro):</b>',
    '  └ สัปดาห์: <b>' + formatPct(gemWeek) + '</b> (' + (gem.weekly_refresh || '168h 0m') + ')',
    '  └ 5 ชั่วโมง: <b>' + formatPct(gemFive) + '</b> (' + (gem.five_hour_refresh || '5h 0m') + ')',
    '• <b>Claude / GPT (Sonnet/Opus):</b>',
    '  └ สัปดาห์: <b>' + formatPct(cgWeek) + '</b> (รีเฟรช ' + (cg.weekly_refresh || '168h 0m') + ')',
    '• <b>เรียกใช้สะสม:</b> ' + (agy.total_prompts || 0) + ' ครั้ง',
    '',
    '🤖 <b>Groq Fast API (Auto-Failover)</b>',
    '• <b>โมเดล:</b> <code>' + (g.model || 'qwen/qwen3.8-27b') + '</code>',
    '• <b>Tokens คงเหลือ:</b> <b>' + (rl.remaining_tokens || 0).toLocaleString() + ' / ' + (rl.limit_tokens || 8000).toLocaleString() + '</b> (' + tokPct + '%)',
    '• <b>เรียกใช้สะสม:</b> ' + (g.total_requests || 0) + ' ครั้ง',
    '━━━━━━━━━━━━━━━━━━━━',
    '📱 <i>ระบบ AI รัน 24 ชม. พร้อม Failover ครบ 3 ชั้น</i>'
  ].join('\n');
}

module.exports = {
  loadQuotaData,
  saveQuotaData,
  recordGroqUsage,
  recordAgyUsage,
  updateAgyQuota,
  recordGlmUsage,
  recordOkmdUsage,
  formatUsageForTelegram,
  formatPct,
  QUOTA_FILE
};
