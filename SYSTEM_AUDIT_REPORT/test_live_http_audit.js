const http = require('http');
const assert = require('assert');

// Set dummy API key for testing environment-only auth
const TEST_KEY = 'test_psc_secret_suite_998877';
process.env.PSC_API_KEY = TEST_KEY;
process.env.PORT = '8999';

const path = require('path');
const { server } = require(path.resolve(__dirname, '..', 'webhook_server.js'));

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

    // Test 3: Authenticated POST via X-PSC-API-KEY -> MUST SUCCEED 200
    await runHttpTest('3. Accept authenticated POST via X-PSC-API-KEY header', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 5000 } } }), 200);

    // Test 4: Authenticated POST via X-API-KEY -> MUST SUCCEED 200
    await runHttpTest('4. Accept authenticated POST via legacy X-API-KEY header', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': TEST_KEY
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 5000 } } }), 200);

    // Test 5: Reject invalid API key -> 401
    await runHttpTest('5. Reject invalid X-PSC-API-KEY header with 401', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': 'wrong_invalid_key_random'
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 5000 } } }), 401);

    // Test 6: Reject invalid Authorization: Bearer -> 401
    await runHttpTest('6. Reject invalid Bearer token with 401', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/stock-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer wrong_token'
        }
    }, JSON.stringify({ Items: { Cabbage: { StockKg: 5000 } } }), 401);

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

    // Test 13: Anonymous GET /ops must NOT mint session cookie and return 401
    await runHttpTest('13. Authenticated /ops gate: Anonymous visitor rejected with 401 and NO cookie', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/ops',
        method: 'GET'
    }, null, 401, (html, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(!sessionCookie, 'Must NOT mint session cookie to anonymous visitor');
        assert.ok(html.includes('Authentication Required'), 'Must present authentication required page');
    });

    // Test 14: Authenticated POST /ops with form data mints valid HttpOnly session cookie
    let capturedCookie = '';
    let extractedSessionToken = '';
    await runHttpTest('14. Authenticated /ops gate: Operator with form auth receives HttpOnly session cookie', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/ops',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, `auth=${TEST_KEY}`, 200, (html, headers) => {
        assert.ok(!html.includes(TEST_KEY), 'CRITICAL: Master PSC_API_KEY must NEVER be leaked to HTML DOM');
        assert.ok(!html.includes('psc_sess_'), 'CRITICAL: Ephemeral session token must NOT be exposed in HTML DOM / JS variable');
        assert.ok(!html.includes('__PSC_API_KEY_PLACEHOLDER__'), 'HTML must not contain un-replaced placeholder');
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(sessionCookie && sessionCookie.includes('HttpOnly'), 'Server must issue HttpOnly session cookie');
        capturedCookie = sessionCookie.split(';')[0];
        extractedSessionToken = capturedCookie.split('=')[1];
    });

    // Test 15: Verify write request with HttpOnly cookie succeeds without any header key
    await runHttpTest('15. HttpOnly cookie authorizes operator write request (/api/team-update)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': capturedCookie
        }
    }, JSON.stringify({ id: '0209', supplier: 'สวนเชียงใหม่ (ทดสอบ Cookie Auth)', truck: 'รถ 6 ล้อ' }), 200);

    // Test 16: Backend Cookie-Only Strictness: Header must NOT accept session token
    await runHttpTest('16. Backend Cookie-Only: Reject session token sent via X-PSC-API-KEY header', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': extractedSessionToken
        }
    }, JSON.stringify({ id: '0209', supplier: 'Hack test' }), 401);

    // Test 17: RBAC Enforcement: Operator Session Cookie must be FORBIDDEN (403) on /api/reboot-bot
    await runHttpTest('17. RBAC: Operator session cookie cannot trigger /api/reboot-bot (403 Forbidden)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/reboot-bot',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': capturedCookie
        }
    }, null, 403);

    // Test 18: RBAC Enforcement: Operator Session Cookie must be FORBIDDEN (403) on /api/sync-quota
    await runHttpTest('18. RBAC: Operator session cookie cannot trigger /api/sync-quota (403 Forbidden)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/sync-quota',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': capturedCookie
        }
    }, JSON.stringify({ groq: { total_requests: 1 } }), 403);

    // Test 19: RBAC Enforcement: Master Key can trigger /api/reboot-bot (200 OK)
    await runHttpTest('19. RBAC: Master API Key can trigger /api/reboot-bot (200 OK)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/reboot-bot',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': TEST_KEY
        }
    }, null, 200);

    // Test 20: GET /api/usage rejects session token in X-PSC-API-KEY header (Backend Cookie-Only Strictness)
    await runHttpTest('20. Backend Cookie-Only: Reject session token sent via X-PSC-API-KEY on GET /api/usage', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/usage',
        method: 'GET',
        headers: {
            'X-PSC-API-KEY': extractedSessionToken
        }
    }, null, 401);

    // Test 21: GET /api/usage rejects session token in Authorization: Bearer header
    await runHttpTest('21. Backend Cookie-Only: Reject session token sent via Authorization: Bearer on GET /api/usage', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/usage',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${extractedSessionToken}`
        }
    }, null, 401);

    // Test 22: POST /api/login issues HttpOnly session cookie without key in URL
    await runHttpTest('22. POST /api/login: Issues HttpOnly session cookie via body access_code (No Key in URL)', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({ access_code: TEST_KEY }), 200, (data, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(sessionCookie && sessionCookie.includes('HttpOnly'), 'POST /api/login must issue HttpOnly session cookie');
    });

    // Test 23: GET /ops?auth=MASTER_KEY -> MUST BE REJECTED 401 with NO Set-Cookie (Zero Secret in URL)
    await runHttpTest('23. Zero Secret in URL: Reject GET /ops?auth=MASTER_KEY with 401 and NO Set-Cookie', {
        hostname: '127.0.0.1',
        port: 8999,
        path: `/ops?auth=${TEST_KEY}`,
        method: 'GET'
    }, null, 401, (html, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(!sessionCookie, 'Must NOT issue session cookie for URL query key authentication');
    });

    // Test 24: POST /ops application/x-www-form-urlencoded -> 200 + psc_session cookie
    await runHttpTest('24. Form Login: POST /ops application/x-www-form-urlencoded returns 200 + psc_session', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/ops',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, `auth=${TEST_KEY}`, 200, (html, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(sessionCookie && sessionCookie.includes('HttpOnly'), 'Must issue HttpOnly session cookie on valid form POST');
    });

    // Test 25: POST /api/team-update with valid cookie -> 200
    await runHttpTest('25. Write API: POST /api/team-update with valid cookie succeeds with 200', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': capturedCookie
        }
    }, JSON.stringify({ id: 'salaya_0209', supplier: 'สวนทดสอบ CAR1', truck: 'รถ 6 ล้อ' }), 200);

    // Test 26: POST /api/team-update with expired/no cookie -> 401
    await runHttpTest('26. Write API: POST /api/team-update with expired/no cookie rejected with 401', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'psc_session=psc_sess_expired_dummy_token_9999'
        }
    }, JSON.stringify({ id: 'salaya_0209', supplier: 'สวนทดสอบ' }), 401);

    // Test 27: POST /api/team-reset with valid cookie -> 200
    await runHttpTest('27. Reset API: POST /api/team-reset with valid cookie succeeds with 200', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-reset',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': capturedCookie
        }
    }, JSON.stringify({ id: 'salaya_0209' }), 200);

    // Test 28: POST /api/team-reset with no cookie -> 401
    await runHttpTest('28. Reset API: POST /api/team-reset with no cookie rejected with 401', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-reset',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({ id: 'salaya_0209' }), 401);

    // Test 29: Browser-style /api/login JSON -> 200 + HttpOnly cookie
    await runHttpTest('29. Login API: POST /api/login JSON returns 200 + HttpOnly cookie', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({ access_code: TEST_KEY }), 200, (data, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(sessionCookie && sessionCookie.includes('HttpOnly'), 'Must issue HttpOnly session cookie');
    });

    // Test 30: /api/login form-urlencoded -> 200 + HttpOnly cookie
    await runHttpTest('30. Login API: POST /api/login form-urlencoded returns 200 + HttpOnly cookie', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, `access_code=${TEST_KEY}`, 200, (data, headers) => {
        const setCookieHeaders = headers['set-cookie'] || [];
        const sessionCookie = setCookieHeaders.find(c => c.includes('psc_session='));
        assert.ok(sessionCookie && sessionCookie.includes('HttpOnly'), 'Must issue HttpOnly session cookie');
    });

    // Test 31: Session token in X-PSC-API-KEY -> 401 (Header strictly checks Master Key)
    await runHttpTest('31. Backend Cookie-Only: Reject session token in X-PSC-API-KEY on write API', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-PSC-API-KEY': extractedSessionToken
        }
    }, JSON.stringify({ id: 'salaya_0209' }), 401);

    // Test 32: Session token in Bearer authorization header -> 401 (Header strictly checks Master Key)
    await runHttpTest('32. Backend Cookie-Only: Reject session token in Authorization: Bearer header', {
        hostname: '127.0.0.1',
        port: 8999,
        path: '/api/team-update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${extractedSessionToken}`
        }
    }, JSON.stringify({ id: 'salaya_0209' }), 401);


    console.log('\n================================================================');
    console.log(`📊 LIVE TEST RESULTS: PASS: ${pass} | FAIL: ${fail}`);
    console.log('================================================================\n');

    server.close(() => {
        process.exit(fail > 0 ? 1 : 0);
    });
});
