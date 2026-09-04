const fs = require('fs');
const path = require('path');

const agyBaseDir = __dirname;
const MEMORY_FILE = path.join(__dirname, 'secretary_memory.json');
const WORKSPACE_DIR = 'E:\\รวมงาน\\งาน 25-26';
const GEMINI_MD_FILE = path.join(WORKSPACE_DIR, 'GEMINI.md');
const MEMORY_MD_FILE = path.join(__dirname, 'SECRETARY_MEMORY.md');

const DEFAULT_MEMORY = {
    version: "2.0",
    last_updated: new Date().toISOString(),
    user_profile: {
        role: "Executive Manager / Business Owner",
        language: "Thai (ภาษาไทย เป็นหลัก)",
        style: "Professional, proactive, concise, executive summaries, actionable insights"
    },
    business_rules: [
        "จัดทำและตรวจสอบกำหนดส่งมอบ GT ล่วงหน้า 2 วัน (D-2) อัตโนมัติทุกรายลูกค้า",
        "รอบส่ง AFT แจ้งเตือนล่วงหน้า 1 วัน (D-1) เวลา 12:00 น. (หากตรงวันอาทิตย์ ให้เลื่อนเตือนเป็นวันเสาร์ 12:00 น.)",
        "เกณฑ์การคำนวณ Yield กะหล่ำปลี: AFT ใช้ Yield 60%, TNS ใช้ Yield 99%",
        "ระบบเฝ้าตรวจเช็กอีเมล PO อัตโนมัติทุก 60 วินาที ในช่วงเวลา 07:00 - 19:00 น."
    ],
    learned_facts: [
        "ลูกค้าหลัก 4 ราย: AFT (Ajinomoto), TNS (Thai Nisshin), Siam Yamamori, Oishi",
        "แหล่งวัตถุดิบกะหล่ำปลี: เฮียหนิง โกดังฮอด (พันธุ์ช้าง), เจ๊อารีย์ (แม่แจ่ม/บ่อสลี), เฮียบุญชู",
        "อัตราค่าขนส่ง 6 ล้อ: ฮอด 12,000 บ., แม่แจ่ม 14,000 บ., แม่เหาะ/เชียงดาว 13,000 บ. (บริการโดยพี่อั๋น)",
        "สต็อกหลักที่ติดตาม: กะหล่ำปลี, หอมใหญ่ (AFT/จีน), แครอท, มันม่วง, มันเหลืองไข่, มันส้ม"
    ],
    custom_directives: [
        "ส่งไฟล์เอกสาร (Excel, PDF) เข้า Telegram ทันทีที่มีการสร้างหรือร้องขอ",
        "ตอบคำถามด้วยข้อมูลจริงที่ค้นพบจากไฟล์ในโฟลเดอร์งาน 25-26 เสมอ"
    ],
    recent_conversations: []
};

let memoryData = null;

function loadMemory() {
    if (memoryData) return memoryData;
    if (fs.existsSync(MEMORY_FILE)) {
        try {
            const raw = fs.readFileSync(MEMORY_FILE, 'utf8').replace(/^\uFEFF/, '');
            memoryData = JSON.parse(raw);
        } catch (e) {
            console.error('[MemoryEngine] Error reading memory JSON:', e);
            memoryData = Object.assign({}, DEFAULT_MEMORY);
        }
    } else {
        memoryData = Object.assign({}, DEFAULT_MEMORY);
        saveMemory();
    }
    syncToWorkspaceMarkdown();
    return memoryData;
}

function saveMemory() {
    if (!memoryData) memoryData = Object.assign({}, DEFAULT_MEMORY);
    memoryData.last_updated = new Date().toISOString();
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
        syncToWorkspaceMarkdown();
    } catch (e) {
        console.error('[MemoryEngine] Error saving memory:', e);
    }
}

function syncToWorkspaceMarkdown() {
    const mem = memoryData || DEFAULT_MEMORY;
    let md = `# 🤖 Google Antigravity & AI Secretary - System Memory & Project Rules\n\n`;
    md += `*Last Synced from Telegram: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}*\n\n`;
    
    md += `## 👤 User Profile & Communication Directives\n`;
    md += `- **Role:** ${mem.user_profile.role || 'Executive'}\n`;
    md += `- **Language:** ${mem.user_profile.language || 'Thai'}\n`;
    md += `- **Tone & Style:** ${mem.user_profile.style || 'Concise & Actionable'}\n\n`;

    md += `## 📜 Established Business Rules & Operational Workflows\n`;
    (mem.business_rules || []).forEach((r, idx) => {
        md += `${idx + 1}. ${r}\n`;
    });
    md += `\n`;

    md += `## 🧠 Learned Facts, Supplier Info & Pricing Knowledge\n`;
    (mem.learned_facts || []).forEach((f, idx) => {
        md += `- ${f}\n`;
    });
    md += `\n`;

    if (mem.custom_directives && mem.custom_directives.length > 0) {
        md += `## ⚡ Custom Directives & Preferences\n`;
        mem.custom_directives.forEach((d, idx) => {
            md += `- ${d}\n`;
        });
        md += `\n`;
    }

    if (mem.recent_conversations && mem.recent_conversations.length > 0) {
        md += `## 💬 Recent Telegram Dialogue Key Points (Episodic Memory)\n`;
        mem.recent_conversations.slice(-8).forEach(turn => {
            md += `> **[${turn.timestamp || ''}] User:** ${turn.user}\n`;
            md += `> **Assistant Summary:** ${turn.summary || turn.assistant}\n\n`;
        });
    }

    try {
        if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
        fs.writeFileSync(GEMINI_MD_FILE, md, 'utf8');
        fs.writeFileSync(MEMORY_MD_FILE, md, 'utf8');
    } catch (e) {
        console.error('[MemoryEngine] Error syncing markdown:', e);
    }
}

function rememberItem(text, category = 'learned_facts') {
    const mem = loadMemory();
    const cleanText = text.trim();
    if (!cleanText) return false;

    if (!mem[category]) mem[category] = [];
    
    // Avoid duplicate
    if (!mem[category].includes(cleanText)) {
        mem[category].push(cleanText);
        saveMemory();
        return true;
    }
    return false;
}

function forgetItem(query) {
    const mem = loadMemory();
    const qLower = String(query).trim().toLowerCase();
    
    // Check if numeric index in combined list
    const num = parseInt(qLower, 10);
    if (!isNaN(num) && num > 0) {
        let currentCount = 0;
        for (const cat of ['business_rules', 'learned_facts', 'custom_directives']) {
            if (mem[cat]) {
                for (let i = 0; i < mem[cat].length; i++) {
                    currentCount++;
                    if (currentCount === num) {
                        const removed = mem[cat].splice(i, 1);
                        saveMemory();
                        return { ok: true, removed: removed[0], category: cat };
                    }
                }
            }
        }
    }

    // Match by text substring
    for (const cat of ['business_rules', 'learned_facts', 'custom_directives']) {
        if (mem[cat]) {
            const idx = mem[cat].findIndex(item => item.toLowerCase().includes(qLower));
            if (idx !== -1) {
                const removed = mem[cat].splice(idx, 1);
                saveMemory();
                return { ok: true, removed: removed[0], category: cat };
            }
        }
    }
    return { ok: false };
}

function addConversationTurn(userText, assistantText) {
    const mem = loadMemory();
    if (!mem.recent_conversations) mem.recent_conversations = [];

    const dateStr = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    
    // Truncate assistant text for concise summary
    let summary = assistantText.replace(/[\r\n]+/g, ' ').trim();
    if (summary.length > 250) summary = summary.substring(0, 250) + '...';

    mem.recent_conversations.push({
        timestamp: dateStr,
        user: userText.trim(),
        summary: summary
    });

    // Keep max 25 recent dialogue turns
    if (mem.recent_conversations.length > 25) {
        mem.recent_conversations.shift();
    }

    // Automatic knowledge synthesis from user dialogue
    autoLearnFromText(userText);
    saveMemory();
}

function autoLearnFromText(userText) {
    const t = userText.trim();
    const lower = t.toLowerCase();

    // 1. Explicit memory patterns: "จำว่า...", "ต่อไปนี้...", "บันทึกว่า...", "/remember..."
    const explicitPatterns = [
        /^(?:จำว่า|จำไว้ว่า|ช่วยจำว่า|บันทึกว่า|ต่อไปนี้ให้|กฎใหม่คือ|ตั้งกฎว่า|\/remember)\s*(.+)/i,
        /^(?:remember|note that)\s*(.+)/i
    ];

    for (const pat of explicitPatterns) {
        const match = t.match(pat);
        if (match && match[1]) {
            let fact = match[1].trim();
            // Sanitize against prompt injection / control character attacks
            fact = fact.replace(/[\r\n\t]+/g, ' ').replace(/["`]/g, "'");
            if (fact.length >= 3 && fact.length <= 200) {
                // Fix H-11: Never allow auto-learning to overwrite immutable business rules or system directives
                rememberItem(fact, 'learned_facts');
                return fact;
            }
        }
    }

    // 2. Implicit business facts (Pricing, Supplier, Yield, Numbers, Dates, Vehicles)
    if (
        (lower.includes('ราคา') || lower.includes('บาท') || lower.includes('ค่ารถ') || lower.includes('yield') || lower.includes('เปอร์เซ็นต์')) &&
        (lower.includes('ปรับ') || lower.includes('เปลี่ยน') || lower.includes('เป็น') || lower.includes('คิด') || lower.includes('กิโล') || lower.includes('กก.'))
    ) {
        let sanitized = t.replace(/[\r\n\t]+/g, ' ').replace(/["`]/g, "'");
        if (sanitized.length >= 8 && sanitized.length <= 150) {
            rememberItem(sanitized, 'learned_facts');
            return sanitized;
        }
    }

    return null;
}

function buildAgyContextPrompt(userPrompt) {
    const mem = loadMemory();
    const groundTruth = (function() {
        try {
            const gtv = require('./ground_truth_validator.js');
            return gtv.buildGroundTruthContext();
        } catch(e) {
            return '';
        }
    })();

    let contextHeader = `==================================================\n`;
    contextHeader += `🛡️ [ANTI-HALLUCINATION & STRICT GROUND-TRUTH POLICY]\n`;
    contextHeader += `1. ตรวจสอบข้อมูลคำสั่งซื้อ วันที่ส่งมอบ และจำนวน กก. ตรงจากไฟล์อีเมลจริงเท่านั้น\n`;
    contextHeader += `2. ห้ามคิดคำนวณ สมมติ หรือสร้างตัวเลขขึ้นเองโดยเด็ดขาด หากไม่มีในไฟล์ ให้ตอบว่า "ไม่พบข้อมูลในเอกสารล่าสุด"\n`;
    contextHeader += `3. ทุกครั้งที่ตอบเรื่องตัวเลข ให้ระบุชื่อไฟล์อ้างอิงและรอบ Rev. ประกอบเสมอ\n\n`;
    contextHeader += `📱 [MOBILE-OPTIMIZED TELEGRAM FORMATTING DIRECTIVE]\n`;
    contextHeader += `• จัดรูปแบบข้อความให้อ่านง่ายบนจอมือถือ (Mobile Screen Friendly)\n`;
    contextHeader += `• ห้ามใช้ตาราง Markdown แบบหลายคอลัมน์แนวนอน เพราะจะล้นจอและอ่านยากบนมือถือ\n`;
    contextHeader += `• ให้ใช้รูปแบบ "การ์ดข้อความ (Card Format)" หัวข้อสั้นชัดเจน มี Emoji นำหน้า และแบ่งวรรคตอนด้วยเส้นคั่น ──────────────────\n`;
    contextHeader += `==================================================\n\n`;

    if (groundTruth) {
        contextHeader += `${groundTruth}\n`;
    }

    contextHeader += `[ระบบความจำเลขา & กฎเกณฑ์ที่เรียนรู้จาก Telegram]:\n`;
    
    // Inject active rules
    if (mem.business_rules && mem.business_rules.length > 0) {
        contextHeader += `• กฎการทำงานสำคัญ: ${mem.business_rules.join(' | ')}\n`;
    }

    // Inject learned facts
    if (mem.learned_facts && mem.learned_facts.length > 0) {
        contextHeader += `• ข้อมูลธุรกิจที่จำได้: ${mem.learned_facts.slice(-6).join(' | ')}\n`;
    }

    // Inject active field operations from team_ops_status.json
    const opsPath = path.join(agyBaseDir, 'team_ops_status.json');
    if (fs.existsSync(opsPath)) {
        try {
            const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
            if (ops.active_operations && ops.active_operations.length > 0) {
                const recentOps = ops.active_operations.slice(-4).map(o => `[${o.customer} ส่ง ${o.delivery_date}] ${o.product} ${o.qty_kg}kg สวน="${o.farm}" รถ="${o.truck}" สถานะ="${o.status}"`).join(' | ');
                contextHeader += `• สถานะงานจัดซื้อ & ขนส่งภาคสนาม (Real-Time Ops): ${recentOps}\n`;
            }
        } catch(e) {}
    }

    // Inject recent context
    if (mem.recent_conversations && mem.recent_conversations.length > 0) {
        const lastTurn = mem.recent_conversations[mem.recent_conversations.length - 1];
        contextHeader += `• บริบทบทสนทนาก่อนหน้า: User="${lastTurn.user}" -> Assistant="${lastTurn.summary}"\n`;
    }

    contextHeader += `--------------------------------------------------\n`;
    return `${contextHeader}\n${userPrompt}`;
}

function formatMemoryForTelegram() {
    const mem = loadMemory();
    let out = `🧠 [ระบบความจำและการเรียนรู้ของเลขา AI]\n`;
    out += `📅 อัปเดตล่าสุด: ${new Date(mem.last_updated).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;

    out += `📜 **กฎการทำงานและข้อตกลง (Business Rules):**\n`;
    let count = 1;
    (mem.business_rules || []).forEach(r => {
        out += `${count++}. ${r}\n`;
    });
    out += `\n`;

    out += `💡 **สิ่งที่ได้เรียนรู้และจดจำไว้ (Learned Facts):**\n`;
    (mem.learned_facts || []).forEach(f => {
        out += `${count++}. ${f}\n`;
    });
    out += `\n`;

    if (mem.custom_directives && mem.custom_directives.length > 0) {
        out += `⚡ **คำสั่งเฉพาะและการปรับแต่ง (Custom Directives):**\n`;
        mem.custom_directives.forEach(d => {
            out += `${count++}. ${d}\n`;
        });
        out += `\n`;
    }

    out += `💬 **ประวัติความจำบทสนทนาล่าสุด (${(mem.recent_conversations || []).length} รายการ):**\n`;
    (mem.recent_conversations || []).slice(-3).forEach(c => {
        out += `• [${c.timestamp}] ${c.user.substring(0, 30)}${c.user.length > 30 ? '...' : ''}\n`;
    });
    out += `\n`;

    out += `🛠️ **วิธีสอน/สั่งให้เลขาจดจำ:**\n`;
    out += `• พิมพ์: \`จำว่า <ข้อความที่ต้องการให้จำ>\`\n`;
    out += `• พิมพ์: \`/forget <ลำดับที่หรือข้อความ>\` เพื่อลบความจำ\n`;
    out += `• หรือคุยแจ้งข้อมูลทั่วไป ระบบจะตรวจจับและเรียนรู้อัตโนมัติครับ ✨`;

    return out;
}

module.exports = {
    loadMemory,
    saveMemory,
    rememberItem,
    forgetItem,
    addConversationTurn,
    autoLearnFromText,
    buildAgyContextPrompt,
    formatMemoryForTelegram,
    syncToWorkspaceMarkdown
};
