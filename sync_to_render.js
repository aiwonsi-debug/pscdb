const https = require('https');

function login() {
  return new Promise((resolve, reject) => {
    const postData = 'auth=9624';
    const req = https.request({
      hostname: 'pscdb.onrender.com',
      port: 443,
      path: '/ops',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      const setCookie = res.headers['set-cookie'] || [];
      const sessionCookie = setCookie.find(c => c.includes('psc_session='));
      if (sessionCookie) {
        resolve(sessionCookie.split(';')[0]);
      } else {
        reject(new Error('No session cookie returned'));
      }
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function postUpdate(cookie, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'pscdb.onrender.com',
      port: 443,
      path: '/api/team-update',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': cookie
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const cookie = await login();
  console.log('Logged in successfully to pscdb.onrender.com');

  const opsToSync = [
    {
      id: 'salaya_0509',
      customer: 'โรงงานศาลายา',
      delivery_date: '2026-09-05',
      farm: 'เจ๊นก (ศาลายาสั่งเอง)',
      product: 'กะหล่ำปลี',
      qty_kg: 8875,
      truck: '6 ล้อ',
      status: 'ขึ้นของและส่งมอบเรียบร้อย (Yield 64%)',
      recorder: 'ทีมงานมือถือภาคสนาม',
      notes: 'รับเข้า 05/09/69 น้ำหนัก 8,875 kg ขนาดกลาง สภาพพอใช้ แมง+ราค่อนข้างเยอะ สุ่ม 100 kg ปอกได้ 64 kg (Yield 64%)',
      orderChecked: true,
      truckChecked: true
    },
    {
      id: 'salaya_1509',
      customer: 'โรงงานศาลายา',
      delivery_date: '2026-09-15',
      farm: 'เฮียหนิง (โกดังฮอด)',
      product: 'กะหล่ำปลี',
      qty_kg: 8000,
      truck: '6 ล้อ 1 คัน',
      status: 'รอดำเนินการ',
      recorder: 'ทีมงานมือถือภาคสนาม',
      notes: 'กะหล่ำเข้าอังคาร 15/9 8 ตัน (8,000 กก.)',
      orderChecked: false,
      truckChecked: false
    }
  ];

  for (const op of opsToSync) {
    const res = await postUpdate(cookie, op);
    console.log(`Sync ${op.id} (${op.delivery_date}): HTTP ${res.status}`);
  }
}

main().catch(console.error);
