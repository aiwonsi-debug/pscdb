const fs = require('fs');
const path = require('path');

// Factory: pass in things that change at runtime as getters, since this
// must always read current state.
//
// Note: getPersistentReplyMarkup, getDashboardInlineMarkup,
// initMiniAppButton were removed (inline-keyboard/menu-button UI,
// unused now that LINE is the only active channel).
function createDashboardUi({ agyBaseDir, isWithinWorkingHours, getCurrentAiEngine, writeLog }) {

    function getDashboardSummary() {
        const nowBkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const timeStr = `${String(nowBkk.getHours()).padStart(2, '0')}:${String(nowBkk.getMinutes()).padStart(2, '0')}:${String(nowBkk.getSeconds()).padStart(2, '0')}`;
        const dateStr = nowBkk.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const inHours = isWithinWorkingHours();
        const workIcon = inHours ? "🟢 07:00 - 19:00 (ระบบเฝ้าระวังทำงาน)" : "🌙 19:00 - 07:00 (ระบบ Standby)";

        let poTrackedCount = 0;
        const regPath = path.join(agyBaseDir, 'downloaded_po_registry.json');
        if (fs.existsSync(regPath)) {
            try {
                const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
                poTrackedCount = Object.keys(reg).length;
            } catch (e) {}
        }

        // Operational stock totals are read from Google Sheets by the live dashboard.
        const cabbageNet = 0;
        const carrotStock = 0;
        const onionStock = 0;

        const currentAiEngine = getCurrentAiEngine();
        const engineName = (currentAiEngine === 'glm') ? 'GLM-5.3 (Open Weights API)' : 'Google Antigravity CLI (AGY)';
        const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

        return `╔══════════════════════════════════╗\n` +
               `   📊 EXECUTIVE SECRETARY DASHBOARD\n` +
               `╚══════════════════════════════════╝\n` +
               `📅 ${dateStr} | ⏰ ${timeStr} น.\n` +
               `สถานะการทำงาน: ${workIcon}\n` +
               `🤖 Active AI Engine: ${engineName}\n` +
               `──────────────────────────────────\n` +
               `📬 [ระบบตรวจจับ Gmail PO Radar]\n` +
               `  • บัญชี: psccnx@gmail.com\n` +
               `  • บันทึก PO ในระบบ: ${poTrackedCount} ฉบับ (ตรวจเช็กอัตโนมัติ)\n` +
               `  • ลูกค้าเชื่อมต่อ: AFT, TNS, Siam Yamamori, Oishi\n` +
               `──────────────────────────────────\n` +
               `🚚 [กำหนดส่งมอบ & แผนจัดเตรียม]\n` +
               `  • AFT (Sep 1): กะหล่ำปลี 2,500 kg | หอมใหญ่ 1,500 kg\n` +
               `  • Yamamori (Sep 5): แครอท 180 kg | หอมใหญ่ 625 kg\n` +
               `  • TNS (Sep 2026): แครอท 15.6t | กะหล่ำปลี 12.7t | พริกหวาน 2t\n` +
               `──────────────────────────────────\n` +
               `🥬 [สถานะสต็อก & วัตถุดิบคงคลัง]\n` +
               `  • กะหล่ำปลีคงเหลือสุทธิ: ${cabbageNet.toLocaleString()} kg\n` +
               `  • หอมใหญ่รวม (AFT+จีน): ${onionStock.toLocaleString()} kg\n` +
               `  • แครอทคงเหลือ: ${carrotStock.toLocaleString()} kg\n` +
               `──────────────────────────────────\n` +
               `🎨 [AI Diffusion 300 DPI Studio]\n` +
               `  • Master Prompts: 500 ชุด (6 หมวดหมู่)\n` +
               `  • Engine: พร้อมสร้างภาพ 300 DPI Print Quality\n` +
               `──────────────────────────────────\n` +
               `💻 Memory: ${memUsage} MB | PM2: Online\n` +
               `แตะปุ่มด้านล่างเพื่อเลือกดูรายละเอียด ⚡`;
    }

    return { getDashboardSummary };
}

module.exports = { createDashboardUi };
