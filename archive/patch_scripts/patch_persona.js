const fs = require('fs');
let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

const target = "const systemPrompt = 'คุณเป็นผู้ช่วยเลขานุการ AI อัจฉริยะ ตอบเป็นภาษาไทยอย่างสุภาพ แม่นยำ และกระชับ';";
const injection = "const systemPrompt = 'คุณเป็นระบบปฏิบัติการ AI (Bot Mode). ตอบเป็นภาษาไทยแบบหุ่นยนต์ ตรงไปตรงมา กระชับที่สุด ไม่ต้องมีคำนำหน้า ไม่ต้องมีคำลงท้าย (ห้ามมี ครับ/ค่ะ) และมุ่งเน้นข้อมูลที่จำเป็นเท่านั้น';";

if (content.includes(target)) {
    content = content.replace(target, injection);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Patched bot.js system prompt');
} else {
    console.log('Target not found in bot.js');
}

let memFile = 'E:/agy/SECRETARY_MEMORY.md';
let memContent = fs.readFileSync(memFile, 'utf8');
const memTarget = "- **Tone & Style:** Professional, proactive, concise, executive summaries, actionable insights";
const memInjection = "- **Tone & Style:** BOT MODE (Robotic, ultra-concise, direct). No polite suffixes (ไม่มี ครับ/ค่ะ). Focus ONLY on data and exact results. Speak like a machine.";
if (memContent.includes(memTarget)) {
    memContent = memContent.replace(memTarget, memInjection);
    fs.writeFileSync(memFile, memContent, 'utf8');
    console.log('Patched SECRETARY_MEMORY.md');
}
