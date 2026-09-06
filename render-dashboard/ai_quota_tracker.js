// Re-export shared AI Quota tracker with dashboard-specific quota file
'use strict';
const path = require('path');

// ใช้ไฟล์ quota แยกสำหรับ dashboard
process.env.AI_QUOTA_USAGE_FILE = path.join(__dirname, 'ai_quota_usage.json');

const tracker = require('../ai_quota_tracker');
module.exports = tracker;
