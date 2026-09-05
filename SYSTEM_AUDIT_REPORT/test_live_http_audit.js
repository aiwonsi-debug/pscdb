const http = require('http');
const assert = require('assert');

// Set dummy API key for testing environment-only auth
const TEST_KEY = 'test_psc_secret_suite_998877';
process.env.PSC_API_KEY = TEST_KEY;
process.env.PORT = '8999';

const { server } = require('E:/agy/webhook_server.js');

let pass = 0;
let fail = 0;

function runHttpTest(name, options, postData, expectedStatus, checkBody) {
    return new Promise((resolve) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    assert.strictEqual(res.statusCode, expectedStatus, `Expected status ${expectedStatus} but got ${res.statusCode}`);
                    if (checkBody) checkBody(data, res.headers);
                    pass++;
                    console.log(`✅ [LIVE TEST PASS] ${name} (HTTP ${res.statusCode})`);
                } catch (e) {
                    fail++;
                    console.log(`❌ [LIVE TEST FAIL] ${name}: ${e.message}`);
                }
                resolve();
            });
        });
        req.on('error', (e) => {
            fail++;
            console.log(`❌ [LIVE TEST ERROR] ${name}: ${e.message}`);
            resolve();
        });
        if (postData) req.write(postData);
        req.end();
    });
}

server.listen(8999, '127.0.0.1', async () => {
    console.log('================================================================');
    console.log('🧪 LIVE HTTP NEGATIVE-TEST AUDIT SUITE (RUNTIME VERIFICATION)');
    console.log('================================================================\n');

    // Test 1: Unauthenticated POST /api/stock-update -> 401
    await runHttpTest('1. Reject unauthenticated POST /api/stock-update', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 100 } } }), 401);

    // Test 2: URL query param token /api/stock-update?key=... -> MUST BE REJECTED 401
    await runHttpTest('2. Reject credentials in URL query string (?key=)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: `/api/stock-update?key=${TEST_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 100 } } }), 401);

    // Test 3: URL query param token /api/stock-update?apiKey=... -> MUST BE REJECTED 401
    await runHttpTest('3. Reject credentials in URL query string (?apiKey=)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: `/api/stock-update?apiKey=${TEST_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 100 } } }), 401);

    // Test 4: Unauthenticated GET /api/usage -> MUST BE REJECTED 401
    await runHttpTest('4. Reject unauthenticated GET /api/usage (Protected Telemetry)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/usage',
        method: 'GET'
    }, null, 401);

    // Test 5: Unauthenticated GET /api/quota -> MUST BE REJECTED 401
    await runHttpTest('5. Reject unauthenticated GET /api/quota (Protected Telemetry)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/quota',
        method: 'GET'
    }, null, 401);

    // Test 6: Authenticated GET /api/usage with Header -> MUST SUCCEED 200
    await runHttpTest('6. Accept authenticated GET /api/usage via X-PSC-API-KEY', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/usage',
        method: 'GET',
        headers: { 'X-PSC-API-KEY': TEST_KEY }
    }, null, 200, (data) => {
        const json = JSON.parse(data);
        assert.ok(json.data, 'Must return quotaData');
    });

    // Test 7: Authenticated POST via Authorization: Bearer -> MUST SUCCEED 200
    await runHttpTest('7. Accept authenticated POST via Authorization: Bearer <key>', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_KEY}`
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 5000 } } }), 200);

    // Test 8: Reject Malformed Stock Schema -> 400 Bad Request
    await runHttpTest('8. Schema validation: Reject malformed payload with 400', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ invalid: 'schema' }), 400);

    // Test 9: Reject Infinity in StockKg -> 400 Bad Request
    await runHttpTest('9. Schema validation: Reject Infinity in StockKg with 400', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 999999999999 } } }), 400);

    // Test 10: Reject Negative StockKg -> 400 Bad Request
    await runHttpTest('10. Schema validation: Reject negative StockKg with 400', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: -10 } } }), 400);

    // Test 11: Reject Unknown SKU -> 400 Bad Request
    await runHttpTest('11. Schema validation: Reject unknown SKU with 400', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ Items: { MaliciousSKU: { StockKg: 100 } } }), 400);

    // Test 12: Strict CORS check: attacker.evil.onrender.com must NOT receive custom origin reflection
    await runHttpTest('12. Strict CORS: untrusted origin does not get reflected', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock',
        method: 'GET',
        headers: {
            'Origin': 'https://evil-attacker.onrender.com'
        }
    }, null, 200, (data, headers) => {
        assert.strictEqual(headers['access-control-allow-origin'], 'https://pscdb.onrender.com', 'Must default to trusted origin only, not reflect evil subdomains');
    });

    // Test 13: Dynamic key injection in /ops HTML serving
    await runHttpTest('13. Serve-time dynamic key injection replaces placeholder in HTML', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/ops',
        method: 'GET'
    }, null, 200, (html) => {
        assert.ok(html.includes(TEST_KEY), 'HTML served must contain injected runtime key');
        assert.ok(!html.includes('psc_sec_ops_2026_key'), 'HTML served must never contain hardcoded fallback key');
    });

    console.log('\n================================================================');
    console.log(`📊 LIVE TEST RESULTS: PASS: ${pass} | FAIL: ${fail}`);
    console.log('================================================================\n');

    server.close(() => {
        process.exit(fail > 0 ? 1 : 0);
    });
});
