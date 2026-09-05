// Client Session Auth via HttpOnly Cookie (No API Key in DOM)
    const STORAGE_KEY = 'PSC_OPS_FOCUSED_SALAYA_TNS_V17';
    let serverCardsState = {};

    // Mobile Push Notification & Haptic Sound Engine
    let pushPermission = (typeof Notification !== 'undefined') ? Notification.permission : 'default';

    function playAlertChime() {}

    function requestPushNotification() {
      if (!('Notification' in window)) {
        alert('เบราว์เซอร์นี้ไม่รองรับระบบ Web Push Notification แต่สามารถรับแจ้งเตือนผ่าน Telegram บอทเลขาได้ค่ะ');
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

    function setFieldValue(type, id, val) {
      if (val === undefined || val === null) return;
      const sel = document.getElementById('sel_' + type + '_' + id) || document.getElementById(type + '_' + id);
      const custom = document.getElementById('custom_' + type + '_' + id);
      if (!sel) return;

      let matched = false;
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === val && val !== '__custom__') {
          sel.selectedIndex = i;
          matched = true;
          break;
        }
      }

      if (matched) {
        if (custom) custom.style.display = 'none';
      } else if (val && val !== '') {
        sel.value = '__custom__';
        if (custom) {
          custom.style.display = 'block';
          custom.value = val;
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
      salaya_0209: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8000, pickup_date: '01/09/26', delivery_date: '02/09/26', title: '🥬 กะหล่ำปลี 8 ตัน', cat: 'salaya' },
      salaya_0309: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 9200, pickup_date: '02/09/26', delivery_date: '03/09/26', title: '🥬 กะหล่ำปลี 9.2 ตัน', cat: 'salaya' },
      salaya_0809: { customer: 'โรงงานศาลายา', product: 'กะหล่ำปลี', qty_kg: 8000, pickup_date: '09/09/26', delivery_date: '10/09/26', title: '🥬 กะหล่ำปลี 8 ตัน', cat: 'salaya' },
      tns_shallot_0709: { customer: 'TNS', product: 'หอมแดง', qty_kg: 500, pickup_date: '06/09/26', delivery_date: '07/09/26', title: '🧅 หอมแดง 500 kg', cat: 'tns' },
      tns_pepper_1609: { customer: 'TNS', product: 'พริกหวานเขียว', qty_kg: 2000, pickup_date: '15/09/26', delivery_date: '16/09/26', title: '🫑 พริกหวานเขียว 2,000 kg', cat: 'tns' },
      tns_shallot_2109: { customer: 'TNS', product: 'หอมแดง', qty_kg: 500, pickup_date: '20/09/26', delivery_date: '21/09/26', title: '🧅 หอมแดง 500 kg', cat: 'tns' }
    };

    
    let currentFilter = 'all';

    
    function filterCategory(cat, element) {
      currentFilter = cat;
      const tabs = document.querySelectorAll('.filter-tabs .tab-btn');
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

      if (badge) badge.textContent = `${completedList.length} รายการ`;

      if (completedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:18px 10px;">ยังไม่มีรายการที่ส่งรายงานขึ้นของ<br><span style="font-size:10.5px; color:#475569;">(เมื่อส่งรายงานขึ้นของให้เลขาทาง Telegram การ์ดจะย้ายลงมาบันทึกที่ตารางนี้อัตโนมัติ)</span></td></tr>`;
        return;
      }

      let html = '';
      completedList.forEach(c => {
        const tagClass = c.meta.cat === 'salaya' ? 'salaya' : 'tns';
        const tagText = c.meta.customer === 'โรงงานศาลายา' ? 'ศาลายา' : 'TNS';
        
        html += `<tr>
          <td><span style="color:#f59e0b; font-weight:600;">${c.loadedDate || c.meta.pickup_date}</span></td>
          <td><span style="color:#38bdf8; font-weight:600;">${c.deliveryDate || c.meta.delivery_date}</span></td>
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

    
    function fetchLiveStock() {
      fetch('/api/stock')
        .then(res => res.json())
        .then(data => {
          if (!data || !data.Items) return;
          const items = data.Items;
          if (items.Cabbage && document.getElementById('stk_val_cabbage')) document.getElementById('stk_val_cabbage').textContent = items.Cabbage.StockKg.toLocaleString() + ' กก.';
          if (items.Onion_AFT && document.getElementById('stk_val_onion_aft')) document.getElementById('stk_val_onion_aft').textContent = items.Onion_AFT.StockKg.toLocaleString() + ' กก.';
          if (items.Onion_Chinese && document.getElementById('stk_val_onion_chinese')) document.getElementById('stk_val_onion_chinese').textContent = items.Onion_Chinese.StockKg.toLocaleString() + ' กก.';
          if (items.Carrot && document.getElementById('stk_val_carrot')) document.getElementById('stk_val_carrot').textContent = items.Carrot.StockKg.toLocaleString() + ' กก.';
          if (items.Purple_Sweet_Potato && document.getElementById('stk_val_purple_potato')) document.getElementById('stk_val_purple_potato').textContent = items.Purple_Sweet_Potato.StockKg.toLocaleString() + ' กก.';
          if (items.Yellow_Sweet_Potato && document.getElementById('stk_val_yellow_potato')) document.getElementById('stk_val_yellow_potato').textContent = items.Yellow_Sweet_Potato.StockKg.toLocaleString() + ' กก.';
          if (items.Orange_Sweet_Potato && document.getElementById('stk_val_orange_potato')) document.getElementById('stk_val_orange_potato').textContent = items.Orange_Sweet_Potato.StockKg.toLocaleString() + ' กก.';
          if (document.getElementById('stock_as_of_badge')) {
            const timeStr = data.LastUpdated ? new Date(data.LastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '15:43';
            document.getElementById('stock_as_of_badge').textContent = 'อัปเดตสต็อก: ' + (data.AsOfDate || '05/09/69') + ' ' + timeStr + ' น.';
          }
        })
        .catch(e => {});
    }

    function syncLiveBackendState() {
      fetch('/api/team-status')
        .then(res => res.json())
        .then(data => {
          if (data && data.cards_state) {
            serverCardsState = data.cards_state;
            if (document.getElementById('ops_sync_badge')) {
              const now = new Date();
              const dStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + (now.getFullYear() + 543).toString().slice(-2);
              const timeStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
              document.getElementById('ops_sync_badge').textContent = 'อัปเดตสด: ' + dStr + ' ' + timeStr + ' น.';
              if (document.getElementById('sys_sync_time')) document.getElementById('sys_sync_time').textContent = dStr + ' ' + timeStr + ' น.';
            }
            syncDynamicOptions(data.custom_suppliers || [], data.custom_trucks || []);
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

            Object.keys(ORDERS_META).forEach(id => {
              const item = serverCardsState[id];
              if (item) {
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
          }
        })
        .catch(e => {});
    }

    function loadSavedState() {
      try {
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
            updateStyles(id);
          }
        });

        const savedPrices = JSON.parse(localStorage.getItem('PSC_DAILY_PRICES')) || {};
        if (savedPrices.cabbage_ning && document.getElementById('dsp_cabbage_ning')) document.getElementById('dsp_cabbage_ning').textContent = savedPrices.cabbage_ning + ' บ./กก.';
        if (savedPrices.cabbage_aree && document.getElementById('dsp_cabbage_aree')) document.getElementById('dsp_cabbage_aree').textContent = savedPrices.cabbage_aree + ' บ./กก.';
        if (savedPrices.cabbage_boonchu && document.getElementById('dsp_cabbage_boonchu')) document.getElementById('dsp_cabbage_boonchu').textContent = savedPrices.cabbage_boonchu + ' บ./กก.';
      } catch (e) {}

      syncLiveBackendState();
      fetchLiveStock();
      setInterval(fetchLiveStock, 30000);
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
          loadedReported: isLoaded
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
          farm: supplier || 'สวนเครือข่าย PSC',
          truck: truck || 'รถขนส่ง 6 ล้อ PSC',
          product: product || 'สินค้าเกษตร',
          qty_kg: qty_kg || 0,
          customer: customer || 'โรงงานศาลายา / TNS',
          delivery_date: delivery_date || '2026-09-01',
          status: statusText,
          orderChecked: orderChecked,
          truckChecked: truckChecked,
          recorder: 'ทีมงานมือถือภาคสนาม'
        };

        fetch('/api/team-update', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(apiPayload)
        }).then(res => {
          if (res.status === 401 || res.status === 403) {
            handleAuthRequired();
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
        // Hide card ONLY when Telegram Loading Report is received!
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

      renderDeliveryLogTable();
    }

    
    
    
    
    function filterCalCustomer(cust, element) {
        const btns = ['btn_cal_all', 'btn_cal_aft', 'btn_cal_tns', 'btn_cal_yamamori'];
        btns.forEach(b => {
          const el = document.getElementById(b);
          if (el) el.classList.remove('active');
        });
        if (element) element.classList.add('active');
  
        const items = document.querySelectorAll('.cal-event-item');
        items.forEach(it => {
          if (cust === 'all') {
            it.style.display = 'block';
          } else {
            it.style.display = it.classList.contains('cal-' + cust) ? 'block' : 'none';
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
      }

      function switchAppTab(tabId) {
      const tabs = ['ops', 'stock', 'sec'];
      tabs.forEach(t => {
        const btn = document.getElementById('tab_btn_' + t);
        const sec = document.getElementById('sec_' + t);
        if (btn) btn.classList.remove('active');
        if (sec) sec.classList.remove('active');
      });

      const activeBtn = document.getElementById('tab_btn_' + tabId);
      const activeSec = document.getElementById('sec_' + tabId);
      const subFilter = document.getElementById('ops_sub_filters');
      
      if (activeBtn) activeBtn.classList.add('active');
      if (activeSec) activeSec.classList.add('active');
      
      if (subFilter) {
        subFilter.style.display = (tabId === 'ops') ? 'flex' : 'none';
      }
    }

    
    function handleAuthRequired() {
      const modal = document.getElementById('auth_modal');
      if (modal) {
        modal.style.display = 'flex';
        const inp = document.getElementById('auth_input');
        if (inp) inp.focus();
      } else {
        const pass = prompt('🔒 เซสชันหมดอายุ กรุณากรอก Access Key เพื่อปลดล็อค:');
        if (pass) {
          submitAuthKey(pass);
        }
      }
    }

    function submitAuthKey(key) {
      if (!key) return;
      fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: key })
      }).then(res => res.json()).then(data => {
        if (data.success) {
          showToast('✅ ปลดล็อคเซสชันสำเร็จ');
          const modal = document.getElementById('auth_modal');
          if (modal) modal.style.display = 'none';
          syncLiveBackendState();
        } else {
          alert('❌ รหัสผ่านไม่ถูกต้อง');
        }
      }).catch(e => alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ'));
    }

    window.onload = function() { loadSavedState(); updateNotificationBtn(); scheduleDaily8AMAlert(); };
