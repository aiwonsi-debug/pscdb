// Client Session Auth via HttpOnly Cookie (No API Key in DOM)
    window.lastPriceUpdate = null; // TODO: no live price-report timestamp source wired up yet — see note to user
    const STORAGE_KEY = 'PSC_OPS_FOCUSED_SALAYA_TNS_V17';
    let serverCardsState = {};

    function sanitizeSupplierName(name) {
      if (typeof name !== 'string' || !name.trim()) return name || '';
      let cleaned = name.replace(/\s*-?\s*[\d,]+(?:\.\d+)?\s*(?:บาท|บ\.?)/g, '');
      cleaned = cleaned.replace(/\(\s*\)/g, '');
      cleaned = cleaned.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
      cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
      cleaned = cleaned.replace(/[-,]\s*$/, '').trim();
      return cleaned;
    }

    // Mobile Push Notification & Haptic Sound Engine
    let pushPermission = (typeof Notification !== 'undefined') ? Notification.permission : 'default';

    function playAlertChime() {}

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      if (msg) toast.innerHTML = msg;
      toast.classList.add('show');
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }
    window.showToast = showToast;

    function requestPushNotification() {
      if (!('Notification' in window)) {
        alert('เบราว์เซอร์นี้ไม่รองรับระบบ Web Push Notification แต่สามารถรับแจ้งเตือนผ่าน LINE บอทเลขาได้ค่ะ');
        return;
      }

      Notification.requestPermission().then(permission => {
        pushPermission = permission;
        updateNotificationBtn();
        if (permission === 'granted') {
          // Sound removed
          showToast('🔔 เปิดรับการแจ้งเตือนบนมือถือสำเร็จ!');
          sendMobileNotification(
            '🔔 ระบบแจ้งเตือนภาคสนาม PSC เปิดใช้งานแล้ว',
            'น้องเลขาจะส่งแจ้งเตือนก่อนวันขึ้นของล่วงหน้า 1 วัน และอัปเดตงานจัดซื้อให้ทราบทันทีค่ะ',
            'd1_welcome'
          );
        } else if (permission === 'denied') {
          alert('ท่านได้ปิดกั้นการแจ้งเตือน กรุณาแตะที่ไอคอนแม่กุญแจหน้า URL เพื่อเปิดอนุญาตการแจ้งเตือน (Notifications) ในการตั้งค่าเบราว์เซอร์ค่ะ');
        }
      });
    }

    function sendMobileNotification(title, body, tag = 'psc_ops', requireInteraction = true) {
      // Sound removed
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/893/893257.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/893/893257.png',
            tag: tag,
            vibrate: [300, 100, 300, 100, 300],
            requireInteraction: true // ปักหมุดเตือนค้างบน Notification bar ไม่หายไปเอง
          });
          notif.onclick = function() {
            window.focus();
            this.close();
          };
        } catch (e) {
          if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
              reg.showNotification(title, {
                body: body,
                icon: 'https://cdn-icons-png.flaticon.com/512/893/893257.png',
                tag: tag,
                vibrate: [300, 100, 300, 100, 300],
                requireInteraction: true
              });
            });
          }
        }
      }
    }

    function testMobileNotification() {
      // Sound removed
      if ('Notification' in window && Notification.permission === 'granted') {
        sendMobileNotification(
          '🔔 [ทดสอบการแจ้งเตือน] ระบบแจ้งเตือนภาคสนาม PSC',
          'ระบบแจ้งเตือนภาคสนาม PSC พร้อมทำงานและปักหมุดแจ้งเตือนล่วงหน้าเมื่อมีรอบขึ้นของค่ะ',
          'test_d1_persistent',
          true
        );
        showToast('🔊 ส่งการแจ้งเตือนแบบเตือนค้างเรียบร้อย!');
      } else {
        requestPushNotification();
      }
    }

    // Emergency Siren Alarm Audio Engine (Loud & Long Oscillation)
    function playEmergencySirenAlert() {}

    function shareAlertToLine() {
      const currentOrigin = window.location.origin || 'https://pscdb.onrender.com';
      let nextOrderText = 'กะหล่ำปลี / ผักสดตามรอบคำสั่งซื้อยืนยัน';
      let nextDateText = 'ตามรอบปฏิทินส่งมอบ';
      
      // Determine nearest uncompleted order dynamically
      if (typeof ORDERS_META !== 'undefined') {
        const orderKeys = Object.keys(ORDERS_META);
        for (const k of orderKeys) {
          const isDone = serverCardsState && serverCardsState[k] && serverCardsState[k].loadedReported;
          if (!isDone) {
            const m = ORDERS_META[k];
            nextOrderText = `${m.title || m.product} เข้า${m.customer}`;
            nextDateText = `${m.pickup_date} (ส่ง ${m.delivery_date})`;
            break;
          }
        }
      }

      const lineMsg = '🚨 [แจ้งเตือนเตรียมขึ้นของล่วงหน้า D-1]\n' +
        '📅 รอบขึ้นของ: ' + nextDateText + '\n' +
        '🥬 รายการ: ' + nextOrderText + '\n' +
        '📌 สิ่งที่ต้องทำ: คอนเฟิร์มตัดผักกับสวนและจองรถขนส่งล่วงหน้าค่ะ\n' +
        '🌐 ดูตารางและสถานะสด: ' + currentOrigin + '/ops';
      
      const lineUrl = 'https://line.me/R/msg/text/?' + encodeURIComponent(lineMsg);
      window.open(lineUrl, '_blank');
    }

    // Daily 08:00 AM Scheduler (Persistent Alert Mode)
    function scheduleDaily8AMAlert() {
      const checkAlert = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const dateStr = now.toISOString().slice(0, 10);
        const alert0800Key = 'PSC_D1_ALERT_8AM_' + dateStr;

        if (currentHour >= 8 && !localStorage.getItem(alert0800Key)) {
          localStorage.setItem(alert0800Key, 'FIRED_AT_' + now.toISOString());
          // Sound removed
          sendMobileNotification(
            '🚨 [08:00 น. เตือนค้าง] เตรียมขึ้นของรอบพรุ่งนี้ (02/09/69)',
            '🥬 กะหล่ำปลี 9.2 ตัน เข้าศาลายา 03/09 - อย่าลืมสั่งผักและจองรถ 6 ล้อล่วงหน้านะคะ',
            'psc_d1_persistent_8am',
            true
          );
        }
      };

      checkAlert();
      setInterval(checkAlert, 60000); // Check every minute
    }

    function updateNotificationBtn() {
      const btn = document.getElementById('btn_enable_push');
      if (!btn) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        btn.innerHTML = '✅ เปิดรับแจ้งเตือนค้าง 08:00 น. แล้ว';
        btn.style.background = '#059669';
      } else {
        btn.innerHTML = '🔔 เปิดรับแจ้งเตือนค้างบนมือถือ (08:00 น.)';
        btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      }
    }


    function getFieldValue(type, id) {
      const dispEl = document.getElementById('disp_' + type + '_' + id);
      if (dispEl && dispEl.textContent && dispEl.textContent !== '-') {
        return dispEl.textContent.trim();
      }
      const sel = document.getElementById('sel_' + type + '_' + id) || document.getElementById(type + '_' + id);
      const custom = document.getElementById('custom_' + type + '_' + id);
      if (sel) {
        if (sel.value === '__custom__') {
          return custom ? custom.value.trim() : '';
        }
        return sel.value;
      }
      return custom ? custom.value.trim() : '';
    }

    function normalizeOptionText(str) {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/^[\uD800-\uDBFF][\uDC00-\uDFFF]|\s+|[📦🌿🌱🚛🛻🧅🫑🚚🏪]/gu, '').replace(/^ส่ง/g, '').trim().toLowerCase();
    }

    function setFieldValue(type, id, val) {
      if (val === undefined || val === null) return;
      const cleanVal = typeof val === 'string' ? val.trim() : String(val);

      // Support clean read-only monitoring display
      const dispEl = document.getElementById('disp_' + type + '_' + id);
      if (dispEl) {
        dispEl.textContent = cleanVal || '-';
      }

      const sel = document.getElementById('sel_' + type + '_' + id) || document.getElementById(type + '_' + id);
      const custom = document.getElementById('custom_' + type + '_' + id);
      if (!sel) return;

      if (cleanVal === '' || cleanVal === '__custom__') {
        if (custom) custom.style.display = 'none';
        return;
      }

      let matchedIndex = -1;

      // 1. Exact match on option.value
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === cleanVal && cleanVal !== '__custom__') {
          matchedIndex = i;
          break;
        }
      }

      // 2. Normalized match on option.value & option.text (stripping emoji, prefix 'ส่ง', spaces)
      if (matchedIndex === -1) {
        const normVal = normalizeOptionText(cleanVal);
        if (normVal) {
          for (let i = 0; i < sel.options.length; i++) {
            const optVal = sel.options[i].value;
            if (optVal === '__custom__') continue;
            const normOptVal = normalizeOptionText(optVal);
            const normOptText = normalizeOptionText(sel.options[i].textContent);
            if (normOptVal === normVal || normOptText === normVal ||
                normOptVal.includes(normVal) || normVal.includes(normOptVal) ||
                normOptText.includes(normVal) || normVal.includes(normOptText)) {
              matchedIndex = i;
              break;
            }
          }
        }
      }

      if (matchedIndex !== -1) {
        sel.selectedIndex = matchedIndex;
        if (custom) {
          custom.style.display = 'none';
          custom.value = '';
        }
      } else {
        // If it looks like a standard option (not a raw custom freeform note), ensure option exists
        ensureOptionExists(sel, cleanVal, type === 'supplier' ? '🌱 ' : '🚛 ');
        let reMatched = false;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === cleanVal) {
            sel.selectedIndex = i;
            reMatched = true;
            break;
          }
        }
        if (reMatched) {
          if (custom) {
            custom.style.display = 'none';
            custom.value = '';
          }
        } else {
          sel.value = '__custom__';
          if (custom) {
            custom.style.display = 'block';
            custom.value = cleanVal;
          }
        }
      }
    }

    function ensureOptionExists(sel, value, prefix = '🌿 ') {
      if (!sel || !value || value === '__custom__' || value.trim() === '') return;
      const cleanVal = value.trim();
      let exists = false;
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === cleanVal) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = cleanVal;
        opt.textContent = (cleanVal.startsWith('🌿') || cleanVal.startsWith('🌱') || cleanVal.startsWith('🚛') || cleanVal.startsWith('🛻') || cleanVal.startsWith('📦') || cleanVal.startsWith('🧅') || cleanVal.startsWith('🫑')) ? cleanVal : (prefix + cleanVal);
        
        const customOpt = sel.querySelector('option[value="__custom__"]');
        if (customOpt) {
          sel.insertBefore(opt, customOpt);
        } else {
          sel.appendChild(opt);
        }
      }
    }

    function syncDynamicOptions(customSuppliers = [], customTrucks = []) {
      const allSelects = document.querySelectorAll('.mobile-select');
      allSelects.forEach(sel => {
        if (sel.id.startsWith('sel_supplier_') || sel.id.startsWith('supplier_')) {
          customSuppliers.forEach(s => ensureOptionExists(sel, s, '🌱 '));
        } else if (sel.id.startsWith('sel_truck_') || sel.id.startsWith('truck_')) {
          customTrucks.forEach(t => ensureOptionExists(sel, t, '🚛 '));
        }
      });
    }

    function onCustomInput(type, id, customer, product, qty, date) {
      const custom = document.getElementById('custom_' + type + '_' + id);
      const sel = document.getElementById('sel_' + type + '_' + id) || document.getElementById(type + '_' + id);
      if (custom && sel && custom.value.trim()) {
        const val = custom.value.trim();
        ensureOptionExists(sel, val, type === 'supplier' ? '🌱 ' : '🚛 ');
        
        // Propagate to all matching select dropdowns
        const allSelects = document.querySelectorAll('.mobile-select');
        allSelects.forEach(s => {
          if ((type === 'supplier' && (s.id.startsWith('sel_supplier_') || s.id.startsWith('supplier_'))) ||
              (type === 'truck' && (s.id.startsWith('sel_truck_') || s.id.startsWith('truck_')))) {
            ensureOptionExists(s, val, type === 'supplier' ? '🌱 ' : '🚛 ');
          }
        });
      }
      saveCard(id, customer, product, qty, date);
    }

    function onSelectChange(type, id, customer, product, qty, date) {
      const sel = document.getElementById('sel_' + type + '_' + id) || document.getElementById(type + '_' + id);
      const custom = document.getElementById('custom_' + type + '_' + id);
      if (sel && custom) {
        if (sel.value === '__custom__') {
          custom.style.display = 'block';
          custom.focus();
        } else {
          custom.style.display = 'none';
        }
      }
      saveCard(id, customer, product, qty, date);
    }


    const ORDERS_META = {
      salaya_0209: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8000, pickup_date: '01/09/69', delivery_date: '02/09/69', title: '🥬 กะหล่ำปลี 8 ตัน', cat: 'salaya' },
      salaya_0309: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 9200, pickup_date: '02/09/69', delivery_date: '03/09/69', title: '🥬 กะหล่ำปลี 9.2 ตัน', cat: 'salaya' },
      salaya_0509: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8875, pickup_date: '04/09/69', delivery_date: '05/09/69', title: '🥬 กะหล่ำปลี 8.875 ตัน (เจ๊นก)', cat: 'salaya' },
      salaya_0809: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 9280, pickup_date: '09/09/69', delivery_date: '10/09/69', title: '🥬 กะหล่ำปลี 9.28 ตัน (รับเข้า 8,450 kg)', cat: 'salaya' },
      salaya_1409: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8500, pickup_date: '13/09/69', delivery_date: '14/09/69', title: '🥬 กะหล่ำปลี 6 ล้อ (~8.5 ตัน)', cat: 'salaya' },
      salaya_1509: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8000, pickup_date: '14/09/69', delivery_date: '15/09/69', title: '🥬 กะหล่ำปลี 8 ตัน', cat: 'salaya' },
      salaya_1809: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8000, pickup_date: '18/09/69', delivery_date: '18/09/69', title: '🥬 กะหล่ำปลี 8 ตัน (บ่อสลี)', cat: 'salaya' },
      tns_shallot_0709: { customer: 'TNS', product: 'หอมแดง', qty_kg: 500, pickup_date: '06/09/69', delivery_date: '07/09/69', title: '🧅 หอมแดง 500 kg', cat: 'tns' },
      tns_pepper_1609: { customer: 'TNS', product: 'พริกหวานเขียว', qty_kg: 2000, pickup_date: '15/09/69', delivery_date: '16/09/69', title: '🫑 พริกหวานเขียว 2,000 kg', cat: 'tns' },
      tns_shallot_2109: { customer: 'TNS', product: 'หอมแดง', qty_kg: 500, pickup_date: '20/09/69', delivery_date: '21/09/69', title: '🧅 หอมแดง 500 kg', cat: 'tns' }
    };

    
    let currentFilter = 'all';

    
    function filterCategory(cat, element) {
      currentFilter = cat;
      const tabs = document.querySelectorAll('#ops_sub_filters .tab-btn');
      tabs.forEach(t => t.classList.remove('active'));
      
      if (element) {
        element.classList.add('active');
      } else if (window.event && window.event.target) {
        window.event.target.classList.add('active');
      }

      const cards = document.querySelectorAll('.order-card');
      cards.forEach(c => {
        const id = c.id.replace('card_', '');
        const isLoaded = (serverCardsState[id] && serverCardsState[id].loadedReported === true);
        
        if (isLoaded) {
          c.style.display = 'none';
          return;
        }

        
if (cat === 'all') {
          c.style.display = 'block';
        } else if (cat === 'salaya') {
          if (c.classList.contains('salaya') || c.classList.contains('cat-salaya')) {
            c.style.display = 'block';
          } else {
            c.style.display = 'none';
          }
        } else if (cat === 'tns') {
          if (c.classList.contains('tns') || c.classList.contains('cat-tns')) {
            c.style.display = 'block';
          } else {
            c.style.display = 'none';
          }
        }
      });
    }
  
    function renderDeliveryLogTable() {
      const tbody = document.getElementById('delivery_log_tbody');
      const badge = document.getElementById('log_count_badge');
      if (!tbody) return;

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const completedList = [];

      Object.keys(ORDERS_META).forEach(id => {
        const sItem = serverCardsState[id] || {};
        const lItem = saved[id] || {};
        const isLoaded = sItem.loadedReported || lItem.loadedReported;

        if (isLoaded) {
          const intakeWeight = sItem.intakeWeight || lItem.intakeWeight || '';
          let displayWeight = sItem.loadedWeight || lItem.loadedWeight || '';
          if (!displayWeight && intakeWeight) {
            displayWeight = (sItem.meta?.qty_kg ? sItem.meta.qty_kg.toLocaleString() + ' kg' : '') + ` (รับเข้า ${intakeWeight})`;
          } else if (displayWeight && intakeWeight && !displayWeight.includes('รับเข้า')) {
            displayWeight = `${displayWeight} (รับเข้า ${intakeWeight})`;
          }

          completedList.push({
            id: id,
            meta: ORDERS_META[id],
            supplier: sItem.supplier || lItem.supplier || 'สวน',
            truck: sItem.truck || lItem.truck || 'รถมาตรฐาน',
            loadedDate: sItem.loadedDate || lItem.loadedDate || ORDERS_META[id].pickup_date,
            deliveryDate: sItem.intakeDate || sItem.deliveryDate || lItem.deliveryDate || ORDERS_META[id].delivery_date,
            loadedItem: sItem.loadedItem || lItem.loadedItem,
            loadedWeight: displayWeight,
            intakeWeight: intakeWeight,
            transitLoss: sItem.transitLoss || lItem.transitLoss || '',
            loadedFreight: sItem.loadedFreight || lItem.loadedFreight,
            loadedPayment: sItem.loadedPayment || lItem.loadedPayment,
            loadedLocation: sItem.loadedLocation || lItem.loadedLocation,
            receivedPrice: sItem.receivedPrice || lItem.receivedPrice,
            receivedYield: sItem.receivedYield || lItem.receivedYield,
            receivedCondition: sItem.receivedCondition || lItem.receivedCondition,
            receivedSize: sItem.receivedSize || lItem.receivedSize
          });
        }
      });

      function parseDateVal(dStr) {
        if (!dStr) return 0;
        var s = String(dStr).trim();
        if (s.indexOf('/') !== -1) {
          var p = s.split('/');
          var day = parseInt(p[0], 10);
          var mon = parseInt(p[1], 10) - 1;
          var yr = parseInt(p[2], 10);
          if (yr < 100) yr += (yr >= 50 ? 2500 - 543 : 2000);
          if (yr > 2500) yr -= 543;
          return new Date(yr, mon, day).getTime() || 0;
        }
        return new Date(s).getTime() || 0;
      }
      function toThaiYearStr(dStr) {
        if (!dStr) return '';
        var s = String(dStr).trim();
        if (s.endsWith('/26')) return s.slice(0, -2) + '69';
        return s;
      }

      completedList.sort(function(a, b) {
        var tB = parseDateVal(b.deliveryDate || b.loadedDate);
        var tA = parseDateVal(a.deliveryDate || a.loadedDate);
        return tB - tA;
      });

      if (badge) badge.textContent = `${completedList.length} รายการ`;

      if (completedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:18px 10px;">ยังไม่มีรายการที่ส่งรายงานขึ้นของ<br><span style="font-size:10.5px; color:#475569;">(เมื่อส่งรายงานขึ้นของให้เลขาทาง LINE การ์ดจะย้ายลงมาบันทึกที่ตารางนี้อัตโนมัติ)</span></td></tr>`;
        return;
      }

      let html = '';
      completedList.forEach(c => {
        const tagClass = c.meta.cat === 'salaya' ? 'salaya' : 'tns';
        const tagText = c.meta.customer === 'โรงงานศาลายา' ? 'ศาลายา' : 'TNS';
        const pickupDate = toThaiYearStr(c.loadedDate || c.meta.pickup_date);
        const deliveryDate = toThaiYearStr(c.deliveryDate || c.meta.delivery_date);
        
        html += `<tr>
          <td><span style="color:#f59e0b; font-weight:600;">${pickupDate}</span></td>
          <td><span style="color:#38bdf8; font-weight:600;">${deliveryDate}</span></td>
          <td>
            <span class="log-tag ${tagClass}">${tagText}</span>
            <div style="font-weight:600; margin-top:2px;">${c.loadedItem || c.meta.title}</div>
          </td>
          <td>
            <b style="color:#34d399;">${c.loadedWeight || (c.meta.qty_kg > 0 ? c.meta.qty_kg.toLocaleString() + ' kg' : '-')}</b>
            ${c.transitLoss ? `<div style="font-size:10px; color:#f87171; margin-top:1px;">สูญเสีย: ${c.transitLoss}</div>` : ''}
            ${c.receivedYield ? `<div style="font-size:10.5px; color:#facc15; margin-top:2px;">Yield: ${c.receivedYield}%</div>` : ''}
            ${c.receivedPrice ? `<div style="font-size:10.5px; color:#38bdf8;">${c.receivedPrice} บ./กก.</div>` : ''}
          </td>
          <td>
            <div style="color:#f8fafc; font-weight:600;">${c.loadedFreight || '-'}</div>
            <div style="font-size:10.5px; color:#94a3b8;">${c.loadedPayment || ''}</div>
          </td>
          <td>
            <span style="color:#cbd5e1;">${c.loadedLocation || c.supplier}</span>
            ${c.receivedSize ? `<div style="font-size:10.5px; color:#f8fafc; margin-top:2px;">ขนาด: ${c.receivedSize}</div>` : ''}
            ${c.receivedCondition ? `<div style="font-size:10.5px; color:#a78bfa;">สภาพ: ${c.receivedCondition}</div>` : ''}
          </td>
          <td>
            <button class="btn-restore" onclick="restoreCard('${c.id}')" title="นำกลับมาแก้ไขในการ์ด">↩️ รีเซ็ต</button>
          </td>
        </tr>`;
      });

      tbody.innerHTML = html;
    }

    function restoreCard(id) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        if (saved[id]) {
          saved[id].loadedReported = false;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        }
        if (serverCardsState[id]) {
          serverCardsState[id].loadedReported = false;
        }

        fetch('/api/team-reset', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: id })
        }).then(res => {
          if (res.status === 401 || res.status === 403) {
            handleAuthRequired();
            return;
          }
          if (res.ok) {
            updateStyles(id);
            showToast('↩️ นำรายการกลับมาแสดงบนแดชบอร์ดเรียบร้อย!');
          }
        }).catch(e => {});
      } catch (e) {}
    }

    function completeCard(id, customer, product, qty_kg, delivery_date) {
      try {
        const supplier = getFieldValue('supplier', id);
        const truck = getFieldValue('truck', id);

        const orderChk = document.getElementById('chk_order_' + id);
        const truckChk = document.getElementById('chk_truck_' + id);
        if (orderChk) orderChk.checked = true;
        if (truckChk) truckChk.checked = true;

        const now = new Date();
        const dStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + (now.getFullYear() + 543).toString().slice(-2);

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        if (!saved[id]) saved[id] = {};
        saved[id].id = id;
        saved[id].supplier = supplier;
        saved[id].truck = truck;
        saved[id].orderChecked = true;
        saved[id].truckChecked = true;
        saved[id].loadedReported = true;
        saved[id].loadedDate = dStr;
        saved[id].loadedItem = supplier ? (product + '<br>' + supplier) : product;
        saved[id].loadedWeight = qty_kg ? (qty_kg.toLocaleString() + ' kg') : '';
        saved[id].clientUpdatedAt = Date.now();

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

        if (!serverCardsState[id]) serverCardsState[id] = {};
        serverCardsState[id].supplier = supplier;
        serverCardsState[id].truck = truck;
        serverCardsState[id].orderChecked = true;
        serverCardsState[id].truckChecked = true;
        serverCardsState[id].loadedReported = true;
        serverCardsState[id].loadedDate = dStr;
        serverCardsState[id].loadedItem = saved[id].loadedItem;
        serverCardsState[id].loadedWeight = saved[id].loadedWeight;

        updateStyles(id);
        renderDeliveryLogTable();
        showToast('✅ บันทึกขึ้นของสำเร็จ! ย้ายลงตารางรายงานเรียบร้อย');

        fetch('/api/team-complete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: id })
        }).then(res => {
          if (res.status === 401 || res.status === 403) {
            handleAuthRequired();
          }
        }).catch(e => {});
      } catch (e) {}
    }
    window.completeCard = completeCard;
    window.restoreCard = restoreCard;

    // ─── Report Tab: Shipment & Delivery Log ────────────────────────────────
    function fetchShipmentReport() {
      fetch('/api/team-status?t=' + Date.now())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data) return;

          // --- Active Operations table ---
          var rawOps = (data.active_operations || []).filter(function(o) {
            return o.delivery_date;
          });
          // Deduplicate operations
          var seenKeys = {};
          var ops = [];
          for (var i = 0; i < rawOps.length; i++) {
            var k = (rawOps[i].delivery_date || '') + '|' + (rawOps[i].customer || '') + '|' + (rawOps[i].product || '') + '|' + (rawOps[i].qty_kg || '');
            if (!seenKeys[k]) {
              seenKeys[k] = true;
              ops.push(rawOps[i]);
            }
          }
          // Sort newest first
          ops.sort(function(a, b) {
            return new Date(b.delivery_date) - new Date(a.delivery_date);
          });
          var tbody = document.getElementById('report_tbody');
          var badge = document.getElementById('report_count_badge');
          if (tbody) {
            if (ops.length === 0) {
              tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:16px;">ไม่มีข้อมูล</td></tr>';
            } else {
              function parseToDateObj(str) {
                if (!str) return null;
                if (str instanceof Date) return str;
                try {
                  if (typeof str === 'string' && str.indexOf('-') !== -1) {
                    var p = str.split('T')[0].split('-');
                    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
                  } else if (typeof str === 'string' && str.indexOf('/') !== -1) {
                    var parts = str.split('/');
                    var dy = parseInt(parts[0], 10);
                    var dm = parseInt(parts[1], 10) - 1;
                    var dyr = parseInt(parts[2], 10);
                    if (dyr > 2500) dyr -= 543;
                    else if (dyr < 100) dyr += 2000;
                    return new Date(dyr, dm, dy);
                  }
                } catch(e) {}
                return null;
              }

              function formatThaiDateStr(d) {
                if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '–';
                var day = ('0' + d.getDate()).slice(-2);
                var mon = ('0' + (d.getMonth() + 1)).slice(-2);
                var yr = (d.getFullYear() + 543).toString().slice(-2);
                return day + '/' + mon + '/' + yr;
              }

              tbody.innerHTML = ops.map(function(o) {
                var statusColor = '#94a3b8';
                if (o.status && o.status.includes('ขึ้นของ')) statusColor = '#34d399';
                else if (o.status && o.status.includes('รอ')) statusColor = '#fbbf24';

                // Received Date (วันที่รับเข้า / ส่งมอบ)
                var delivDateObj = parseToDateObj(o.delivery_date || o.received_date);
                var delivLabel = delivDateObj ? formatThaiDateStr(delivDateObj) : (o.delivery_date || '–');

                // Sent Date (วันที่ขึ้นของ / ส่งออก)
                var rawSent = o.sent_date || o.pickup_date || o.loaded_date;
                if (!rawSent && (o.card_id || o.id)) {
                  var cMeta = ORDERS_META[o.card_id || o.id];
                  var cState = serverCardsState && serverCardsState[o.card_id || o.id];
                  rawSent = (cMeta && cMeta.pickup_date) || (cState && cState.loadedDate);
                }
                var sentDateObj = parseToDateObj(rawSent);
                if (!sentDateObj && delivDateObj) {
                  // Fallback: 1 day before delivery date (standard farm loading D-1)
                  sentDateObj = new Date(delivDateObj.getTime());
                  sentDateObj.setDate(sentDateObj.getDate() - 1);
                }
                var sentLabel = sentDateObj ? formatThaiDateStr(sentDateObj) : '–';

                return '<tr>' +
                  '<td style="white-space:nowrap;font-weight:600;color:#93c5fd;">' + sentLabel + '</td>' +
                  '<td style="white-space:nowrap;font-weight:600;color:#fef08a;">' + delivLabel + '</td>' +
                  '<td>' + (o.customer||'–') + '</td>' +
                  '<td>' + sanitizeSupplierName(o.farm||'–') + '</td>' +
                  '<td>' + (o.product||'–') + '</td>' +
                  '<td style="text-align:right;">' + (o.qty_kg ? o.qty_kg.toLocaleString() : '–') + '</td>' +
                  '<td>' + sanitizeSupplierName(o.truck||'–') + '</td>' +
                  '<td style="color:'+statusColor+';">' + (o.status||'–') + '</td>' +
                  '<td style="font-size:11px;color:#94a3b8;">' + (o.notes||'') + '</td>' +
                  '</tr>';
              }).join('');
            }
          }
          if (badge) badge.textContent = ops.length + ' รายการ';

          // --- History Logs table ---
          var rawLogs = (data.history_logs || []).slice();
          var seenLogKeys = {};
          var logs = [];
          for (var j = 0; j < rawLogs.length; j++) {
            var item = rawLogs[j];
            var lk = (item.date || '') + '|' + (item.item || '') + '|' + (item.weight || '') + '|' + (item.location || '');
            if (!seenLogKeys[lk]) {
              seenLogKeys[lk] = true;
              // Normalize year if 26 -> 69
              if (item.date && item.date.endsWith('/26')) {
                item.date = item.date.slice(0, -2) + '69';
              }
              logs.push(item);
            }
          }
          logs.sort(function(a, b) {
            return new Date(b.timestamp||b.date) - new Date(a.timestamp||a.date);
          });
          var hbody = document.getElementById('history_tbody');
          var hbadge = document.getElementById('history_count_badge');
          if (hbody) {
            if (logs.length === 0) {
              hbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px;">ไม่มีข้อมูล</td></tr>';
            } else {
              hbody.innerHTML = logs.map(function(l) {
                return '<tr>' +
                  '<td style="white-space:nowrap;font-weight:600;">' + (l.date||'–') + '</td>' +
                  '<td>' + (l.item||'–') + '</td>' +
                  '<td style="text-align:right;">' + (l.weight||'–') + '</td>' +
                  '<td>' + (l.freight||'–') + '</td>' +
                  '<td>' + (l.payment||'–') + '</td>' +
                  '<td>' + (l.location||'–') + '</td>' +
                  '</tr>';
              }).join('');
            }
          }
          if (hbadge) hbadge.textContent = logs.length + ' รายการ';
        })
        .catch(function(e) {
          var tbody = document.getElementById('report_tbody');
          if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:16px;">⚠️ โหลดข้อมูลไม่สำเร็จ</td></tr>';
        });
    }
    window.fetchShipmentReport = fetchShipmentReport;

    
    function fetchLiveStock() {
       fetch('/api/stock?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
          if (!data || !data.Items) return;
          const items = data.Items;
          if (items.Cabbage && document.getElementById('stk_val_cabbage')) document.getElementById('stk_val_cabbage').textContent = items.Cabbage.StockKg.toLocaleString();
          if (items.Onion_AFT && document.getElementById('stk_val_onion_aft')) document.getElementById('stk_val_onion_aft').textContent = items.Onion_AFT.StockKg.toLocaleString();
          if (items.Onion_Chinese && document.getElementById('stk_val_onion_chinese')) document.getElementById('stk_val_onion_chinese').textContent = items.Onion_Chinese.StockKg.toLocaleString();
          if (items.Carrot && document.getElementById('stk_val_carrot')) document.getElementById('stk_val_carrot').textContent = items.Carrot.StockKg.toLocaleString();
          
          if (items.Cabbage && items.Cabbage.Yield) {
            const aftYield = items.Cabbage.Yield.AFT;
            if (aftYield !== undefined) {
              const yieldPct = (aftYield > 1 ? aftYield : aftYield * 100).toFixed(2);
              const forecastEl = document.getElementById('stk_forecast_cabbage');
              if (forecastEl) {
                forecastEl.textContent = `รถเข้า 16.5 ตัน พอถึง 19/09 · Yield ล่าสุด ${yieldPct}%`;
              }
            }
          }

          if (document.getElementById('stock_as_of_badge')) {
            const timeStr = data.LastUpdated ? new Date(data.LastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '19:01';
            const asOf = data.AsOfDate || '05/09/69';
            document.getElementById('stock_as_of_badge').textContent = 'อัปเดตสต็อก: ' + asOf + ' ' + timeStr + ' น.';
            
            window.lastStockUpdate = 'อัปเดต ' + asOf + ' ' + timeStr + ' น.';
            if (document.getElementById('header_timestamp_val') && document.getElementById('tab_btn_stock') && document.getElementById('tab_btn_stock').classList.contains('active')) {
                document.getElementById('header_timestamp_val').textContent = window.lastStockUpdate;
            }

            if (document.getElementById('stock_card_title')) {
              document.getElementById('stock_card_title').textContent = '📦 สต็อกตรวจนับจริงล่าสุด (' + asOf + ') & คาดการณ์';
            }
          }

          // Dynamic 2 Recent Audits Comparison
          if (data.RecentAudits && data.RecentAudits.length >= 2) {
            const cur = data.RecentAudits[0];
            const prev = data.RecentAudits[1];
            if (document.getElementById('audit_compare_label')) {
              document.getElementById('audit_compare_label').textContent = cur.AsOfDate + ' เทียบกับ ' + prev.AsOfDate;
            }
            const tbody = document.getElementById('stock_compare_tbody');
            if (tbody) {
              const skuMeta = [
                { key: 'Cabbage', name: '🥬 กะหล่ำปลี' },
                { key: 'Onion_AFT', name: '🧅 หอม AFT' },
                { key: 'Onion_Chinese', name: '🧅 หอมจีน' },
                { key: 'Carrot', name: '🥕 แครอทสวย' }
              ];
              let rowsHtml = '';
              const activeSkus = skuMeta.filter(s => cur.Items && cur.Items[s.key] !== undefined);
              activeSkus.forEach((sku, idx) => {
                const cVal = cur.Items[sku.key] || 0;
                const pVal = prev.Items[sku.key] || 0;
                const diff = cVal - pVal;
                let diffStr = '0 กก.';
                let diffColor = '#94a3b8';
                if (diff > 0) {
                  diffStr = '+' + diff.toLocaleString() + ' กก.';
                  diffColor = '#10b981';
                } else if (diff < 0) {
                  diffStr = diff.toLocaleString() + ' กก.';
                  diffColor = '#f59e0b';
                }
                const bBorder = idx < activeSkus.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.04);' : '';
                rowsHtml += `<tr style="${bBorder}">
                  <td style="padding:6px 8px;">${sku.name}</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">${pVal.toLocaleString()} กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">${cVal.toLocaleString()} กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:${diffColor};">${diffStr}</td>
                </tr>`;
              });
              tbody.innerHTML = rowsHtml;
            }

            // Also dynamically update the comparison bars on individual cards
            const skusToUpdate = [
              { key: 'Cabbage', idSuffix: 'cabbage' },
              { key: 'Onion_AFT', idSuffix: 'onion_aft' },
              { key: 'Onion_Chinese', idSuffix: 'onion_chinese' },
              { key: 'Carrot', idSuffix: 'carrot' }
            ];
            skusToUpdate.forEach(s => {
              const cVal = cur.Items ? (cur.Items[s.key] || 0) : 0;
              const pVal = prev.Items ? (prev.Items[s.key] || 0) : 0;
              const lblEl = document.getElementById('stk_cmp_lbl_' + s.idSuffix);
              const diffEl = document.getElementById('stk_cmp_diff_' + s.idSuffix);
              if (lblEl && prev.AsOfDate) {
                lblEl.textContent = `เทียบ ${prev.AsOfDate}: ${pVal.toLocaleString()} กก.`;
              }
              if (diffEl) {
                const diff = cVal - pVal;
                const pct = pVal > 0 ? ((diff / pVal) * 100).toFixed(1) : '0';
                if (diff > 0) {
                  diffEl.className = 'comparison-diff diff-positive';
                  diffEl.textContent = `+${diff.toLocaleString()} (+${pct}%)`;
                } else if (diff < 0) {
                  diffEl.className = 'comparison-diff diff-negative';
                  diffEl.textContent = `${diff.toLocaleString()} (${pct}%)`;
                } else {
                  diffEl.className = 'comparison-diff';
                  diffEl.textContent = '0 (0%)';
                }
              }
            });
          }
        })
        .catch(e => {});
    }

    function fetchLivePrice() {
      fetch('/api/prices?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
          if (data && data.AsOfDate) {
            window.lastPriceUpdate = 'อัปเดต ' + data.AsOfDate + ' 14:00 น.';
          } else {
            window.lastPriceUpdate = 'อัปเดต 16/09 14:00 น.';
          }
          if (document.getElementById('header_timestamp_val') && document.getElementById('tab_btn_price') && document.getElementById('tab_btn_price').classList.contains('active')) {
              document.getElementById('header_timestamp_val').textContent = window.lastPriceUpdate;
          }
        })
        .catch(e => {
          window.lastPriceUpdate = 'อัปเดต 16/09 14:00 น.';
          if (document.getElementById('header_timestamp_val') && document.getElementById('tab_btn_price') && document.getElementById('tab_btn_price').classList.contains('active')) {
              document.getElementById('header_timestamp_val').textContent = window.lastPriceUpdate;
          }
        });
    }

    function syncLiveBackendState(isForce = false) {
      const url = '/api/team-status' + (isForce ? '?force=1&t=' + Date.now() : '');
      if (isForce) showToast('🔄 กำลังดึงข้อมูลล่าสุดจาก Google Sheet...');
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.live_schedules) && data.live_schedules.length > 0) {
            renderDynamicScheduleCards(data.live_schedules, data.cards_state || {});
            if (isForce) showToast('✅ ซิงค์ข้อมูลจาก Google Sheet สำเร็จ!');
          }

          if (data && data.cards_state) {
            serverCardsState = data.cards_state;
            if (document.getElementById('ops_sync_badge') || document.getElementById('sys_sync_time')) {
              let lastRevisedTime = data.last_updated ? new Date(data.last_updated) : null;
              if (data.cards_state) {
                Object.values(data.cards_state).forEach(c => {
                  const t = c.updatedAt || c.reportedAt || c.timestamp;
                  if (t) {
                    const d = new Date(t);
                    if (!isNaN(d.getTime()) && (!lastRevisedTime || d > lastRevisedTime)) {
                      lastRevisedTime = d;
                    }
                  }
                });
              }
              if (Array.isArray(data.history_logs)) {
                data.history_logs.forEach(l => {
                  if (l.timestamp) {
                    const d = new Date(l.timestamp);
                    if (!isNaN(d.getTime()) && (!lastRevisedTime || d > lastRevisedTime)) {
                      lastRevisedTime = d;
                    }
                  }
                });
              }
              if (lastRevisedTime && !isNaN(lastRevisedTime.getTime())) {
                const dStr = ('0' + lastRevisedTime.getDate()).slice(-2) + '/' + ('0' + (lastRevisedTime.getMonth() + 1)).slice(-2);
                const timeStr = ('0' + lastRevisedTime.getHours()).slice(-2) + ':' + ('0' + lastRevisedTime.getMinutes()).slice(-2);
                if (document.getElementById('ops_sync_badge')) {
                  document.getElementById('ops_sync_badge').textContent = 'อัปเดตล่าสุด: ' + dStr + ' ' + timeStr + ' น.';
                }
                
                window.lastOpsUpdate = 'อัปเดต ' + dStr + ' ' + timeStr + ' น.';
                if (document.getElementById('header_timestamp_val') && document.getElementById('tab_btn_delivery') && document.getElementById('tab_btn_delivery').classList.contains('active')) {
                    document.getElementById('header_timestamp_val').textContent = window.lastOpsUpdate;
                }

                if (document.getElementById('sys_sync_time')) {
                  document.getElementById('sys_sync_time').textContent = dStr + ' ' + timeStr + ' น.';
                }
              }
            }
            syncDynamicOptions(data.custom_suppliers || [], data.custom_trucks || []);
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

            Object.keys(ORDERS_META).forEach(id => {
              const item = serverCardsState[id];
              if (item) {
                const localItem = saved[id] || {};
                const localAge = localItem.clientUpdatedAt ? (Date.now() - localItem.clientUpdatedAt) : 999999;
                
                // If local user edited within the last 15 seconds, don't let background poll override
                if (localAge < 15000) {
                  return;
                }

                saved[id] = Object.assign(saved[id] || {}, item);
                
                // Sync DOM Checkboxes directly from server
                const orderChk = document.getElementById('chk_order_' + id);
                const truckChk = document.getElementById('chk_truck_' + id);
                if (orderChk && item.orderChecked !== undefined) {
                  orderChk.checked = !!item.orderChecked;
                }
                if (truckChk && item.truckChecked !== undefined) {
                  truckChk.checked = !!item.truckChecked;
                }

                if (item.supplier) setFieldValue('supplier', id, item.supplier);
                if (item.truck) setFieldValue('truck', id, item.truck);
              }
              updateStyles(id);
            });

            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            renderDeliveryLogTable();
          }

          if (data && Array.isArray(data.history_logs)) {
            renderDynamicIntakeCards(data.history_logs);
          }

          if (data && data.other_tasks) {
            renderOtherTasks(data.other_tasks);
          }
        })
        .catch(e => {});
    }

    function renderDynamicScheduleCards(schedules, cardsState = {}) {
      const container = document.getElementById('schedule_cards_container');
      if (!container || !Array.isArray(schedules) || schedules.length === 0) return;

      let html = '';
      schedules.forEach((s, idx) => {
        const cardKey = s.id || ('sched_' + idx);
        const state = cardsState[cardKey] || {};
        const supplier = state.supplier || s.supplier || 'ยังไม่ระบุ';
        const truck = state.truck || s.truck || 'ยังไม่ระบุ';
        const statusText = state.status || s.status || 'รอดำเนินการ';

        let badgeClass = 'badge-info';
        if (statusText.includes('เรียบร้อย') || statusText.includes('แล้ว')) {
          badgeClass = 'badge-normal';
        } else if (statusText.includes('รอ')) {
          badgeClass = 'badge-warning';
        }

        const isSalaya = s.cat === 'salaya';
        const iconEmoji = isSalaya ? '🥬' : (s.product.includes('หอม') ? '🧅' : '🫑');
        const weightText = s.weight ? (parseFloat(s.weight) >= 1000 ? (parseFloat(s.weight) / 1000) + ' ตัน' : s.weight + ' kg') : '';
        const title = `${iconEmoji} ${s.customer}: ${s.product} ${weightText} (${s.origin || supplier})`;

        html += `
        <div id="card_${cardKey}" class="flat-card warning-card order-card ${s.cat} cat-${s.cat}">
          <div class="card-header-row">
            <div class="card-title-text">${title}</div>
            <span class="status-badge ${badgeClass}" id="disp_status_${cardKey}">${statusText}</span>
          </div>
          <div class="route-row">
            <span>ขึ้นของ: ${s.date || '–'} (${s.origin || 'สวน'})</span>
            <span class="route-arrow">→</span>
            <span>${s.detail || ('ส่งมอบ ' + s.customer)}</span>
          </div>
          <div class="columns-2">
            <div>
              <span class="col-label">แหล่งสวน</span>
              <div class="col-val ${supplier === 'ยังไม่ระบุ' ? 'empty' : ''}" id="disp_supplier_${cardKey}">${supplier}</div>
            </div>
            <div>
              <span class="col-label">รถขนส่ง</span>
              <div class="col-val ${truck === 'ยังไม่ระบุ' ? 'empty' : ''}" id="disp_truck_${cardKey}">${truck}</div>
            </div>
          </div>
        </div>`;
      });

      container.innerHTML = html;
    }

    function renderDynamicIntakeCards(historyLogs) {
      const container = document.getElementById('intake_cards_container');
      if (!container || !Array.isArray(historyLogs) || historyLogs.length === 0) return;

      // Filter intake records that have date & item or weight
      const intakeItems = historyLogs.filter(item => {
        return item && (item.item || item.weight) && (item.date || item.timestamp);
      });

      if (intakeItems.length === 0) return;

      // Deduplicate by date + item + weight
      const seen = {};
      const uniqueIntakes = [];
      intakeItems.forEach(item => {
        const k = (item.date || '') + '|' + (item.item || '') + '|' + (item.weight || '');
        if (!seen[k]) {
          seen[k] = true;
          uniqueIntakes.push(item);
        }
      });

      // Sort chronological descending (latest date first)
      uniqueIntakes.sort((a, b) => {
        const parseD = (str) => {
          if (!str) return 0;
          const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (match) {
            let yr = parseInt(match[3], 10);
            if (yr > 2500) yr -= 543;
            else if (yr < 100) yr += 2000;
            return new Date(yr, parseInt(match[2], 10) - 1, parseInt(match[1], 10)).getTime();
          }
          return new Date(str).getTime() || 0;
        };
        const tA = parseD(a.date) || new Date(a.timestamp || 0).getTime();
        const tB = parseD(b.date) || new Date(b.timestamp || 0).getTime();
        return tB - tA;
      });

      let html = '';
      uniqueIntakes.slice(0, 10).forEach(item => {
        // Parse Title and Subtitle
        let rawItem = item.item || 'วัตถุดิบ';
        let titleText = 'กะหล่ำปลี';
        let subtitleText = 'เฮียหนิง (อมพาย แม่สะเรียง)';

        if (rawItem.includes('หอมแดง')) {
          titleText = 'หอมแดง';
          subtitleText = rawItem.replace(/หอมแดง/g, '').replace(/[()]/g, '').trim() || 'ป้าผา (สาขาท่าลี่)';
        } else if (rawItem.includes('กะหล่ำ')) {
          titleText = 'กะหล่ำปลี';
          let sub = rawItem.replace(/รับเข้ากะหล่ำปลี|ขึ้นกะหล่ำปลี|กะหล่ำปลี/g, '').replace(/[()]/g, '').trim();
          subtitleText = sub || 'เฮียหนิง (อมพาย แม่สะเรียง)';
        } else {
          titleText = rawItem;
          subtitleText = item.location || 'แหล่งสวน';
        }

        // Dates
        let intakeDate = item.date || '–';
        if (intakeDate.includes(' ')) intakeDate = intakeDate.split(' ')[0];
        if (intakeDate.endsWith('/26')) intakeDate = intakeDate.slice(0, -2) + '69';

        // Pickup Date (D-1 fallback or from log)
        let pickupDate = item.pickupDate || item.loadedDate || '';
        if (!pickupDate) {
          const m = intakeDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
          if (m) {
            let d = parseInt(m[1], 10) - 1;
            pickupDate = (d > 0 ? String(d).padStart(2, '0') : '01') + '/' + m[2] + '/' + m[3];
          } else {
            pickupDate = intakeDate;
          }
        }

        // Yield badge
        let yieldVal = item.yield || (item.details && item.details.receivedYield);
        let yieldBadge = '';
        if (yieldVal) {
          const yNum = parseFloat(yieldVal);
          const badgeClass = yNum >= 70 ? 'badge-normal' : (yNum >= 60 ? 'badge-warning' : 'badge-critical');
          yieldBadge = `<span class="status-badge ${badgeClass}">Yield ${yNum.toFixed(2)}%</span>`;
        } else if (titleText === 'หอมแดง') {
          yieldBadge = `<span class="status-badge badge-normal">Yield 100%</span>`;
        }

        // Weight
        let receivedWeight = item.weight || (item.details && item.details.weight) || '–';
        let weightUp = item.weightUp || '–';
        let transitLoss = item.transitLoss || '–';
        let pricePerKg = item.price || (item.details && item.details.receivedPrice) || (titleText === 'หอมแดง' ? '45.00 บ./กก.' : '4.50 บ./กก.');
        if (typeof pricePerKg === 'number') pricePerKg = pricePerKg.toFixed(2) + ' บ./กก.';



        // Freight
        let freight = item.freight || (item.details && item.details.freight) || '13,000 บ. (เก็บปลายทาง)';
        if (titleText === 'หอมแดง') freight = '800 บ. (นิ่มซี่เส็ง)';
        else if (subtitleText.includes('เจ๊นก')) freight = 'ส่งตรงโรงงาน (รวมในบิล)';

        // Quality note
        let note = item.notes || item.condition || (item.details && item.details.receivedCondition) || '';
        if (!note) {
          if (item.details && item.details.rawText) {
            const lines = item.details.rawText.split('\n').map(l => l.trim()).filter(Boolean);
            const condLine = lines.find(l => l.includes('สภาพ') || l.includes('ขนาด') || l.includes('สุ่ม'));
            if (condLine) note = condLine;
          }
        }


        html += `
        <div class="flat-card">
          <div class="card-header-row">
            <div>
              <div class="card-title-text">${titleText}</div>
              <div class="card-subtitle-text">${subtitleText}</div>
            </div>
            ${yieldBadge}
          </div>

          <div class="date-flow-box">
            <div class="date-flow-item">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <div>
                <span class="date-lbl">วันที่ขึ้นของ</span>
                <span>${pickupDate}</span>
              </div>
            </div>
            <span class="route-arrow">→</span>
            <div class="date-flow-item">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <div>
                <span class="date-lbl">วันที่รับเข้า</span>
                <span>${intakeDate}</span>
              </div>
            </div>
          </div>

          <div class="grid-2x2">
            <div class="grid-cell">
              <span class="lbl">น้ำหนักขึ้น</span>
              <span class="val">${weightUp}</span>
            </div>
            <div class="grid-cell">
              <span class="lbl">รับจริง</span>
              <span class="val">${receivedWeight}</span>
            </div>
            <div class="grid-cell">
              <span class="lbl">Transit loss</span>
              <span class="val" style="color: var(--status-critical-text);">${transitLoss}</span>
            </div>
            <div class="grid-cell">
              <span class="lbl">ราคาต้นทาง</span>
              <span class="val">${pricePerKg}</span>
            </div>
          </div>

          <div class="freight-row">
            <div class="freight-label">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
              <span>ค่ารถ</span>
            </div>
            <div class="freight-val">${freight}</div>
          </div>

          <div class="quality-note-box">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <div>
              <span style="color: var(--text-muted); display: block; margin-bottom: 2px;">หมายเหตุคุณภาพ</span>
              <span>${note}</span>
            </div>
          </div>
        </div>`;
      });

      container.innerHTML = html;
    }

    function renderOtherTasks(tasks) {
      const tbody = document.getElementById('other_task_tbody');
      const badge = document.getElementById('other_task_count_badge');
      if (!tbody) return;

      if (Array.isArray(tasks)) {
        try { localStorage.setItem('PSC_OTHER_TASKS', JSON.stringify(tasks)); } catch(e) {}
      } else {
        try {
          const cached = JSON.parse(localStorage.getItem('PSC_OTHER_TASKS'));
          if (Array.isArray(cached)) tasks = cached;
        } catch(e) {}
      }

      if (badge) badge.textContent = (tasks ? tasks.length : 0) + ' รายการ';

      if (!tasks || tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:16px;">ยังไม่มีรายการงานอื่น / งานปลูกในระบบ</td></tr>';
        return;
      }

      let html = '';
      tasks.forEach(t => {
        const id = t.id;
        const crop = t.crop || '-';
        const seller = t.seller || '-';
        const cust = t.target_customer || 'TNS';
        const delivery = t.target_delivery || '-';
        const type = t.task_type || 'งานปลูก';
        const status = t.status || 'รอดำเนินการ';
        const notes = t.notes || '-';
        
        let custBadge = 'badge-primary';
        if (cust === 'TNS') custBadge = 'badge-tns';
        else if (cust === 'AFT') custBadge = 'badge-salaya';
        else if (cust === 'Yamamori') custBadge = 'badge-warning';

        html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
          <td><span class="badge badge-success">${type}</span></td>
          <td style="font-weight:700; color:#38bdf8;">${crop}</td>
          <td style="color:#e2e8f0;">${seller}</td>
          <td><span class="badge ${custBadge}">${cust}</span></td>
          <td style="color:#fbbf24; font-weight:600;">${delivery}</td>
          <td><span style="color:#34d399; font-weight:600; font-size:11px;">${status}</span></td>
          <td style="color:#94a3b8; font-size:11.5px;">${notes}</td>
          <td>
            <button type="button" class="btn-restore" onclick="deleteOtherTask('${id}')" style="background:rgba(239,68,68,0.15); border-color:#ef4444; color:#f87171;">ลบ</button>
          </td>
        </tr>`;
      });
      tbody.innerHTML = html;
    }
    window.renderOtherTasks = renderOtherTasks;

    function submitNewOtherTask() {
      const typeEl = document.getElementById('inp_task_type');
      const cropEl = document.getElementById('inp_task_crop');
      const sellerEl = document.getElementById('inp_task_seller');
      const custEl = document.getElementById('inp_task_customer');
      const deliveryEl = document.getElementById('inp_task_delivery');
      const statusEl = document.getElementById('inp_task_status');
      const notesEl = document.getElementById('inp_task_notes');

      const payload = {
        task_type: typeEl ? typeEl.value : 'งานปลูก',
        crop: cropEl ? cropEl.value : 'ต้นหอม',
        seller: sellerEl ? sellerEl.value : '',
        target_customer: custEl ? custEl.value : 'TNS',
        target_delivery: deliveryEl ? deliveryEl.value : 'ปลายเดือน 9',
        status: statusEl ? statusEl.value : 'กำลังเพาะปลูก',
        notes: notesEl ? notesEl.value : ''
      };

      if (!payload.crop.trim()) {
        alert('กรุณาระบุชนิดผัก');
        return;
      }

      const btn = document.getElementById('btn_submit_other_task') || ((typeof event !== 'undefined' && event && event.target) ? event.target.closest('button') : null);
      if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> กำลังบันทึก...';
      }

      function restoreBtn() {
        if (btn) {
          btn.disabled = false;
          if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
        }
      }

      const sessToken = (typeof localStorage !== 'undefined' && localStorage.getItem('PSC_SESSION_TOKEN')) || '';
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (sessToken) {
        reqHeaders['X-PSC-Session'] = sessToken;
        reqHeaders['Authorization'] = 'Bearer ' + sessToken;
      }

      fetch('/api/add-other-task', {
        method: 'POST',
        credentials: 'include',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          restoreBtn();
          handleAuthRequired(() => submitNewOtherTask());
          return null;
        }
        return res.json();
      })
      .then(data => {
        restoreBtn();
        if (data && data.success) {
          showToast('🌱 บันทึกงานเรียบร้อยแล้ว!');
          if (sellerEl) sellerEl.value = '';
          if (notesEl) notesEl.value = '';
          if (data.other_tasks) {
            try { localStorage.setItem('PSC_OTHER_TASKS', JSON.stringify(data.other_tasks)); } catch(e) {}
            renderOtherTasks(data.other_tasks);
          } else if (data.task) {
            try {
              const cur = JSON.parse(localStorage.getItem('PSC_OTHER_TASKS')) || [];
              cur.unshift(data.task);
              localStorage.setItem('PSC_OTHER_TASKS', JSON.stringify(cur));
              renderOtherTasks(cur);
            } catch(e) {}
            syncLiveBackendState();
          } else {
            syncLiveBackendState();
          }
        } else if (data && data.error) {
          alert('ไม่สามารถบันทึกได้: ' + data.error);
        }
      })
      .catch(e => {
        restoreBtn();
        alert('เกิดข้อผิดพลาดในการบันทึกงาน (' + (e && e.message ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้') + ')');
      });
    }
    window.submitNewOtherTask = submitNewOtherTask;

    function deleteOtherTask(id) {
      if (!confirm('ต้องการลบรายการงานนี้ใช่หรือไม่?')) return;
      const sessToken = (typeof localStorage !== 'undefined' && localStorage.getItem('PSC_SESSION_TOKEN')) || '';
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (sessToken) {
        reqHeaders['X-PSC-Session'] = sessToken;
        reqHeaders['Authorization'] = 'Bearer ' + sessToken;
      }

      fetch('/api/delete-other-task', {
        method: 'POST',
        credentials: 'include',
        headers: reqHeaders,
        body: JSON.stringify({ id: id })
      })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          handleAuthRequired(() => deleteOtherTask(id));
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.success) {
          showToast('ลบรายการเรียบร้อย');
          if (data.other_tasks) {
            try { localStorage.setItem('PSC_OTHER_TASKS', JSON.stringify(data.other_tasks)); } catch(e) {}
            renderOtherTasks(data.other_tasks);
          } else {
            try {
              let cur = JSON.parse(localStorage.getItem('PSC_OTHER_TASKS')) || [];
              cur = cur.filter(t => t.id !== id);
              localStorage.setItem('PSC_OTHER_TASKS', JSON.stringify(cur));
              renderOtherTasks(cur);
            } catch(e) {}
            syncLiveBackendState();
          }
        }
      })
      .catch(e => {});
    }
    window.deleteOtherTask = deleteOtherTask;

    function loadSavedState() {
      try {
        // Sync dynamic options first from localStorage if previously stored
        const savedOps = JSON.parse(localStorage.getItem('PSC_OPS_CACHED_CUSTOM') || '{}');
        if (savedOps.suppliers || savedOps.trucks) {
          syncDynamicOptions(savedOps.suppliers || [], savedOps.trucks || []);
        }

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        const items = Object.keys(ORDERS_META);
        
        items.forEach(id => {
          if (saved[id]) {
            if (saved[id].supplier) {
              setFieldValue('supplier', id, saved[id].supplier);
            }
            if (saved[id].truck) {
              setFieldValue('truck', id, saved[id].truck);
            }
            if (saved[id].orderChecked !== undefined && document.getElementById('chk_order_' + id)) {
              document.getElementById('chk_order_' + id).checked = saved[id].orderChecked;
            }
            if (saved[id].truckChecked !== undefined && document.getElementById('chk_truck_' + id)) {
              document.getElementById('chk_truck_' + id).checked = saved[id].truckChecked;
            }
          }
          updateStyles(id);
        });

        const savedPrices = JSON.parse(localStorage.getItem('PSC_DAILY_PRICES')) || {};
        if (savedPrices.cabbage_ning && document.getElementById('dsp_cabbage_ning')) document.getElementById('dsp_cabbage_ning').textContent = savedPrices.cabbage_ning + ' บ./กก.';
        if (savedPrices.cabbage_aree && document.getElementById('dsp_cabbage_aree')) document.getElementById('dsp_cabbage_aree').textContent = savedPrices.cabbage_aree + ' บ./กก.';
        if (savedPrices.cabbage_boonchu && document.getElementById('dsp_cabbage_boonchu')) document.getElementById('dsp_cabbage_boonchu').textContent = savedPrices.cabbage_boonchu + ' บ./กก.';

        // Load cached other_tasks immediately to prevent blank UI on slow network
        try {
          const cachedOther = JSON.parse(localStorage.getItem('PSC_OTHER_TASKS'));
          if (Array.isArray(cachedOther) && cachedOther.length > 0) {
            renderOtherTasks(cachedOther);
          }
        } catch(e) {}
      } catch (e) {}

      syncLiveBackendState();
      fetchLiveStock();
      fetchLivePrice();
      fetchShipmentReport();
      setInterval(fetchLiveStock, 30000);
      setInterval(fetchLivePrice, 30000);
      setInterval(fetchShipmentReport, 60000);
      setInterval(syncLiveBackendState, 3000);
    }

    function saveCard(id, customer, product, qty_kg, delivery_date, showFeedback = false) {
      try {
        const supplier = getFieldValue('supplier', id);
        const truck = getFieldValue('truck', id);
        const orderChkEl = document.getElementById('chk_order_' + id);
        const truckChkEl = document.getElementById('chk_truck_' + id);
        const orderChecked = orderChkEl ? orderChkEl.checked : false;
        const truckChecked = truckChkEl ? truckChkEl.checked : false;

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        const isLoaded = (serverCardsState[id] && serverCardsState[id].loadedReported) || (saved[id] && saved[id].loadedReported) || false;

        const payloadLocal = {
          id: id,
          supplier: supplier,
          truck: truck,
          orderChecked: orderChecked,
          truckChecked: truckChecked,
          loadedReported: isLoaded,
          clientUpdatedAt: Date.now()
        };

        saved[id] = payloadLocal;
        if (!serverCardsState[id]) serverCardsState[id] = {};
        serverCardsState[id].supplier = supplier;
        serverCardsState[id].truck = truck;
        serverCardsState[id].orderChecked = orderChecked;
        serverCardsState[id].truckChecked = truckChecked;
        serverCardsState[id].loadedReported = isLoaded;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        updateStyles(id);

        let statusText = 'รอดำเนินการ';
        if (orderChecked && truckChecked) statusText = 'สั่งของและสั่งรถเรียบร้อย (รอวันขึ้นของ)';
        else if (orderChecked) statusText = 'สั่งของแล้ว (รอยืนยันรถ)';
        else if (truckChecked) statusText = 'จองรถแล้ว (รอยืนยันของ)';

        const apiPayload = {
          id: id,
          farm: supplier || '',
          supplier: supplier || '',
          truck: truck || '',
          product: product || (ORDERS_META[id] ? ORDERS_META[id].product : 'สินค้าเกษตร'),
          qty_kg: qty_kg || (ORDERS_META[id] ? ORDERS_META[id].qty_kg : 0),
          customer: customer || (ORDERS_META[id] ? ORDERS_META[id].customer : 'ลูกค้า PSC'),
          delivery_date: delivery_date || (ORDERS_META[id] ? ORDERS_META[id].delivery_date : '2026-09-01'),
          status: statusText,
          orderChecked: orderChecked,
          truckChecked: truckChecked,
          recorder: 'ทีมงานมือถือภาคสนาม'
        };

        const sessToken = (typeof localStorage !== 'undefined' && localStorage.getItem('PSC_SESSION_TOKEN')) || '';
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (sessToken) {
          reqHeaders['X-PSC-Session'] = sessToken;
          reqHeaders['Authorization'] = 'Bearer ' + sessToken;
        }

        fetch('/api/team-update', {
          method: 'POST',
          credentials: 'same-origin',
          headers: reqHeaders,
          body: JSON.stringify(apiPayload)
        }).then(res => {
          if (res.status === 401 || res.status === 403) {
            handleAuthRequired(function() {
              saveCard(id, customer, product, qty_kg, delivery_date, showFeedback);
            });
            return null;
          }
          return res.json();
        }).then(data => {
          if (!data) return;
          if (data.success && showFeedback) {
            showToast('✓ บันทึกสำเร็จ: ' + (orderChecked && truckChecked ? 'สั่งของ & สั่งรถแล้ว' : (orderChecked ? 'สั่งของแล้ว' : (truckChecked ? 'สั่งรถแล้ว' : 'ยกเลิกติ๊กแล้ว'))));
          } else if (!data.success && showFeedback) {
            showToast('❌ บันทึกล้มเหลว: ' + (data.error || 'กรุณาลองใหม่'));
          }
        }).catch(e => {
          if (showFeedback) showToast('✓ บันทึกลงเครื่องเรียบร้อย!');
        });

      } catch (e) {
        console.error('Error saving card:', e);
      }
    }

    function toggleCard(id, customer, product, qty, date) {
      saveCard(id, customer, product, qty, date, true);
    }

    function updateStyles(id) {
      const orderChk = document.getElementById('chk_order_' + id) ? document.getElementById('chk_order_' + id).checked : false;
      const truckChk = document.getElementById('chk_truck_' + id) ? document.getElementById('chk_truck_' + id).checked : false;

      const orderLbl = document.getElementById('lbl_order_' + id);
      const truckLbl = document.getElementById('lbl_truck_' + id);

      if (orderLbl) {
        if (orderChk) orderLbl.classList.add('checked');
        else orderLbl.classList.remove('checked');
      }

      if (truckLbl) {
        if (truckChk) truckLbl.classList.add('checked');
        else truckLbl.classList.remove('checked');
      }

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const isLoaded = (serverCardsState[id] && serverCardsState[id].loadedReported) || (saved[id] && saved[id].loadedReported);

      const card = document.getElementById('card_' + id);
      if (card) {
        // Hide card ONLY when LINE Loading Report is received!
        if (isLoaded) {
          card.style.display = 'none';
        } else {
          if (currentFilter === 'all' || card.classList.contains('cat-' + currentFilter)) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        }
      }

      // Update read-only monitoring status badge
      const statusBadge = document.getElementById('disp_status_' + id);
      if (statusBadge) {
        const itemState = serverCardsState[id] || saved[id] || {};
        if (isLoaded) {
          statusBadge.className = 'badge badge-success';
          statusBadge.textContent = 'ขึ้นของเรียบร้อย ✓';
        } else if (itemState.orderChecked && itemState.truckChecked) {
          statusBadge.className = 'badge badge-primary';
          statusBadge.textContent = 'สั่งของ & สั่งรถแล้ว (รอขึ้นของ)';
        } else if (itemState.orderChecked) {
          statusBadge.className = 'badge badge-info';
          statusBadge.textContent = 'สั่งของแล้ว (รอยืนยันรถ)';
        } else if (itemState.truckChecked) {
          statusBadge.className = 'badge badge-info';
          statusBadge.textContent = 'จองรถแล้ว (รอยืนยันของ)';
        } else {
          statusBadge.className = 'badge badge-warning';
          statusBadge.textContent = 'รอดำเนินการ';
        }
      }

      renderDeliveryLogTable();
    }

    
    
    
    
    function filterCalCustomer(cust, element) {
        const btns = ['btn_cal_all', 'btn_cal_aft', 'btn_cal_tns', 'btn_cal_yamamori'];
        btns.forEach(b => {
          const el = document.getElementById(b);
          if (el) el.classList.remove('active');
        });

        let targetEl = element;
        if (!targetEl && typeof window !== 'undefined' && window.event) {
          targetEl = window.event.currentTarget || window.event.target;
        }
        if (!targetEl) {
          targetEl = document.getElementById('btn_cal_' + cust);
        }
        if (targetEl && targetEl.classList) {
          targetEl.classList.add('active');
        }

        const items = document.querySelectorAll('.cal-event-item');
        items.forEach(it => {
          if (cust === 'all') {
            it.style.display = 'block';
          } else {
            const isAft = (cust === 'aft' && (it.classList.contains('cal-aft') || it.classList.contains('cal-salaya')));
            const isMatch = isAft || it.classList.contains('cal-' + cust);
            it.style.display = isMatch ? 'block' : 'none';
          }
        });

        const innerItems = document.querySelectorAll('.inner-factory');
        innerItems.forEach(it => {
            if (cust === 'all') {
                it.style.display = 'block';
            } else {
                it.style.display = it.classList.contains('inner-' + cust) ? 'block' : 'none';
            }
        });

        const weekBoxes = document.querySelectorAll('.cal-week-box');
        weekBoxes.forEach(box => {
          if (cust === 'all') {
            box.style.display = 'block';
          } else {
            const visibleItems = box.querySelectorAll('.cal-event-item');
            let hasVisible = false;
            visibleItems.forEach(vi => {
              if (vi.style.display !== 'none') hasVisible = true;
            });
            box.style.display = hasVisible ? 'block' : 'none';
          }
        });
      }

    function initCalFilterListeners() {
      const filterMap = [
        { id: 'btn_cal_all', cust: 'all' },
        { id: 'btn_cal_aft', cust: 'aft' },
        { id: 'btn_cal_tns', cust: 'tns' },
        { id: 'btn_cal_yamamori', cust: 'yamamori' }
      ];
      filterMap.forEach(item => {
        const btn = document.getElementById(item.id);
        if (btn) {
          btn.onclick = function(e) {
            filterCalCustomer(item.cust, this);
          };
          btn.addEventListener('click', function(e) {
            filterCalCustomer(item.cust, this);
          });
        }
      });
    }

    let isProgrammaticScroll = false;
    let scrollTimeout = null;

    window.updateTabHeader = function updateTabHeader(tabId) {
      const subtitleEl = document.getElementById('header_subtitle');
      const timeEl = document.getElementById('header_timestamp_val');
      const badgeEl = document.getElementById('header_timestamp_badge');
      const iconClock = document.getElementById('header_icon_clock');
      const iconAlert = document.getElementById('header_icon_alert');

      // No hardcoded/current-time fallback here on purpose: showing the
      // browser's current time as if it were the data's update time is
      // misleading. Show a neutral loading label until the real
      // window.last*Update (derived from actual report/received timestamps)
      // is populated by the fetch handlers below.
      const dynamicTime = 'กำลังโหลดข้อมูล...';

      if (subtitleEl) {
        if (tabId === 'stock') {
          subtitleEl.textContent = 'สต็อกตรวจนับจริงล่าสุด';
          if (timeEl) timeEl.textContent = window.lastStockUpdate || dynamicTime;
          if (badgeEl) badgeEl.className = 'header-timestamp status-fresh';
          if (iconClock) iconClock.style.display = 'block';
          if (iconAlert) iconAlert.style.display = 'none';
        } else if (tabId === 'price') {
          subtitleEl.textContent = 'ราคาวัตถุดิบ & ค่าขนส่ง';
          if (timeEl) timeEl.textContent = window.lastPriceUpdate || dynamicTime;
          if (badgeEl) badgeEl.className = 'header-timestamp status-aged';
          if (iconClock) iconClock.style.display = 'none';
          if (iconAlert) iconAlert.style.display = 'block';
        } else {
          subtitleEl.textContent = 'รายการรอส่งมอบ';
          if (timeEl) timeEl.textContent = window.lastOpsUpdate || dynamicTime;
          if (badgeEl) badgeEl.className = 'header-timestamp status-fresh';
          if (iconClock) iconClock.style.display = 'block';
          if (iconAlert) iconAlert.style.display = 'none';
        }
      }

      const subFilter = document.getElementById('ops_sub_filters');
      if (subFilter) {
        subFilter.style.display = (tabId === 'ops' || tabId === 'delivery') ? 'flex' : 'none';
      }

      if (tabId === 'stock' && typeof fetchLiveStock === 'function') {
        fetchLiveStock();
      }
      if (tabId === 'price' && typeof fetchLivePrice === 'function') {
        fetchLivePrice();
      }
    }

    function switchAppTab(tabId) {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.getElementById('tab_btn_' + tabId);
      if (activeBtn) activeBtn.classList.add('active');

      const carousel = document.getElementById('tabs_carousel');
      const targetSec = document.getElementById('sec_' + tabId);
      if (carousel && targetSec) {
        isProgrammaticScroll = true;
        clearTimeout(scrollTimeout);
        carousel.scrollTo({
          left: targetSec.offsetLeft,
          behavior: 'smooth'
        });
        scrollTimeout = setTimeout(() => {
          isProgrammaticScroll = false;
        }, 500);
      }

      updateTabHeader(tabId);
    }
    window.switchAppTab = switchAppTab;
    window.filterCategory = filterCategory;
    window.filterCalCustomer = filterCalCustomer;

    
    function handleAuthRequired(onSuccessCallback) {
      // Try silent auto-login first using saved access code
      try {
        const savedCode = localStorage.getItem('PSC_TEAM_ACCESS_CODE');
        if (savedCode) {
          fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_code: savedCode })
          }).then(res => res.json()).then(data => {
            if (data.success) {
              if (data.token) localStorage.setItem('PSC_SESSION_TOKEN', data.token);
              if (typeof onSuccessCallback === 'function') onSuccessCallback();
              else syncLiveBackendState();
              return;
            }
            showAuthModal(onSuccessCallback);
          }).catch(() => showAuthModal(onSuccessCallback));
          return;
        }
      } catch (e) {}

      showAuthModal(onSuccessCallback);
    }

    let _pendingAuthCallback = null;
    function showAuthModal(onSuccessCallback) {
      if (typeof onSuccessCallback === 'function') {
        _pendingAuthCallback = onSuccessCallback;
      }
      const modal = document.getElementById('auth_modal');
      if (modal) {
        modal.style.display = 'flex';
        const inp = document.getElementById('auth_input');
        if (inp) {
          inp.focus();
          inp.onkeydown = function(ev) {
            if (ev.key === 'Enter') submitAuthKey(inp.value, _pendingAuthCallback);
          };
        }
      } else {
        const pass = prompt('🔒 เซสชันหมดอายุ กรุณากรอก Access Key เพื่อปลดล็อค:');
        if (pass) {
          submitAuthKey(pass, _pendingAuthCallback);
        }
      }
    }

    function submitAuthKey(key, onSuccessCallback) {
      const cb = onSuccessCallback || _pendingAuthCallback;
      if (!key) return;
      const cleanKey = key.trim();
      fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: cleanKey })
      }).then(res => res.json()).then(data => {
        if (data.success) {
          try {
            localStorage.setItem('PSC_TEAM_ACCESS_CODE', cleanKey);
            if (data.token) localStorage.setItem('PSC_SESSION_TOKEN', data.token);
          } catch (e) {}
          showToast('✅ ปลดล็อคและจำอุปกรณ์เรียบร้อย (30 วัน)');
          const modal = document.getElementById('auth_modal');
          if (modal) modal.style.display = 'none';
          _pendingAuthCallback = null;
          if (typeof cb === 'function') cb();
          else syncLiveBackendState();
        } else {
          alert('❌ รหัสผ่านไม่ถูกต้อง');
        }
      }).catch(e => alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ'));
    }

    window.onload = function() { 
      // Proactive silent auth refresh if savedCode exists
      try {
        const savedCode = localStorage.getItem('PSC_TEAM_ACCESS_CODE');
        if (savedCode) {
          fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_code: savedCode })
          }).then(res => res.json()).then(data => {
            if (data && data.token) localStorage.setItem('PSC_SESSION_TOKEN', data.token);
          }).catch(function() {});
        }
      } catch (e) {}

      loadSavedState(); 
      initCalFilterListeners();
      updateNotificationBtn(); 
      scheduleDaily8AMAlert(); 
    };

    window.syncLiveBackendState = syncLiveBackendState;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCalFilterListeners);
    } else {
      initCalFilterListeners();
    }
