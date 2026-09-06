// AI Quota & Usage Tracker with Loop-Safe Sync (bloat‑reduced)
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const QUOTA_FILE = process.env.AI_QUOTA_USAGE_FILE || path.join(__dirname, 'ai_quota_usage.json');
const PSC_API_KEY = (process.env.PSC_API_KEY || '').trim();
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
      models: 'Gemini Flash, Gemini Pro