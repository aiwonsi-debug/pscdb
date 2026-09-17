// cleanup_cards_state.js
// Calls the new POST /api/team-cleanup endpoint on pscdb.onrender.com to:
//   1. Merge cards_state IDs that differ only by whitespace
//      (e.g. "tns_shallot_0709" vs "tns_shallot_0709 " vs "tns_shallot_0709_v2")
//   2. Remove known test/debug entries ("test", "209", "test_write_...", "โรงงานศาลายา")
//
// Requires the Master API Key (PSC_API_KEY) as an environment variable or first CLI arg,
// since /api/team-cleanup is a destructive admin action gated by isMasterAuth.
//
// Usage:
//   PSC_API_KEY=your-key node cleanup_cards_state.js
//   node cleanup_cards_state.js your-key
//
// To also merge "tns_shallot_0709_v2" into the canonical "tns_shallot_0709" (different
// suffix, not just whitespace — not auto-merged by the endpoint), pass explicit IDs to
// remove via the CLEANUP_REMOVE_IDS env var (comma-separated) after confirming on the
// live dashboard which version holds the correct data.

const https = require('https');

const apiKey = process.env.PSC_API_KEY || process.argv[2];
if (!apiKey) {
    console.error('Missing Master API Key. Set PSC_API_KEY env var or pass as first argument.');
    process.exit(1);
}

const removeIdsEnv = process.env.CLEANUP_REMOVE_IDS;
const payload = JSON.stringify(
    removeIdsEnv ? { remove_ids: removeIdsEnv.split(',').map(s => s.trim()) } : {}
);

const req = https.request({
    hostname: 'pscdb.onrender.com',
    port: 443,
    path: '/api/team-cleanup',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-PSC-API-KEY': apiKey
    }
}, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        try {
            console.log(JSON.stringify(JSON.parse(body), null, 2));
        } catch (e) {
            console.log(body);
        }
    });
});
req.on('error', (e) => console.error('Request failed:', e.message));
req.write(payload);
req.end();
