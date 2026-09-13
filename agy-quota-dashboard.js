#!/usr/bin/env node
/**
 * Antigravity CLI Quota Dashboard
 * ----------------------------------------------------------------
 * แสดงสถานะ quota (โควต้าการใช้งาน) ของ Antigravity CLI แบบ text-only
 * รองรับจอความละเอียดต่ำ (low-res display) - ไม่ใช้ Unicode box drawings
 * Refresh อัตโนมัติทุก 60 วินาที
 *
 * แหล่งข้อมูล: agy -p "/usage" --output-format json
 * ----------------------------------------------------------------
 */

const { execSync } = require("child_process");

const REFRESH_MS = 60_000;       // รอบ refresh = 60 วินาที
const BAR_WIDTH = 20;            // ความกว้างของ progress bar
const DATA_COMMAND = 'agy -p "/usage" --output-format json';

// ---------- ฟังก์ชันดึงข้อมูล ----------
function fetchQuotaData() {
  try {
    const raw = execSync(DATA_COMMAND, {
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true
    });
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Invalid output from agy");
    }
    return { ok: true, data: JSON.parse(raw.slice(start, end + 1)) };
  } catch (err) {
    // Fallback เผื่อใช้คำสั่ง agy-usage json
    try {
      const rawFallback = execSync("agy-usage json", {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
      return { ok: true, data: JSON.parse(rawFallback) };
    } catch (e) {
      return { ok: false, error: err.message };
    }
  }
}

// ---------- ฟังก์ชันวาด progress bar แบบ ASCII ----------
function renderBar(percentRemaining) {
  const pct = Math.max(0, Math.min(100, percentRemaining));
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}

// ---------- ฟังก์ชันเลือกระดับเตือนตามเปอร์เซ็นต์คงเหลือ ----------
function statusLabel(percentRemaining) {
  if (percentRemaining > 70) return "OK";
  if (percentRemaining > 30) return "WARN";
  return "LOW";
}

// ---------- ฟังก์ชันจัดรูปแบบเวลาปัจจุบัน ----------
function nowString() {
  const d = new Date();
  return d.toLocaleTimeString("th-TH", { hour12: false });
}

// ---------- ฟังก์ชันแปลงเวลา Reset ----------
function formatResetTime(isoOrStr) {
  if (!isoOrStr) return "";
  try {
    const resetDate = new Date(isoOrStr);
    if (!isNaN(resetDate.getTime())) {
      const diffMs = resetDate.getTime() - Date.now();
      if (diffMs <= 0) return "ready";
      const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (totalHours >= 24) {
        const days = Math.floor(totalHours / 24);
        const remH = totalHours % 24;
        return `in ${days}d ${remH}h`;
      }
      return `in ${totalHours}h ${mins}m`;
    }
  } catch (e) {}
  return String(isoOrStr);
}

// ---------- ฟังก์ชันวาด dashboard ทั้งหมด ----------
function render() {
  // ล้างหน้าจอและล้าง scrollback history ทั้งหมด (ไม่ให้ค้างประวัติเก่า)
  process.stdout.write('\x1b[3J\x1b[H\x1b[2J');
  console.clear();

  const line = "=".repeat(50);
  console.log(line);
  console.log(" ANTIGRAVITY CLI QUOTA DASHBOARD");
  console.log(" Last update: " + nowString() + "  (auto refresh 60s)");
  console.log(line);

  const result = fetchQuotaData();

  if (!result.ok) {
    console.log("");
    console.log(" [ERROR] ไม่สามารถดึงข้อมูลได้");
    console.log(" รายละเอียด: " + (result.error ? result.error.split("\n")[0] : "Unknown error"));
    console.log("");
    console.log(" ตรวจสอบ:");
    console.log("  1. Antigravity CLI (agy) ติดตั้งและพร้อมทำงานใน PATH");
    console.log("  2. Antigravity CLI ต้องล็อกอินอยู่");
    console.log(line);
    return;
  }

  // รองรับทั้ง schema agy ดั้งเดิม และ schema agy-usage
  const rawData = result.data;
  const groups = rawData?.command?.data?.groups || rawData?.groups || rawData?.models || [];

  if (!Array.isArray(groups) || groups.length === 0) {
    console.log("");
    console.log(" ไม่พบข้อมูล quota (ตรวจสอบรูปแบบ JSON output ของ agy)");
    console.log(line);
    return;
  }

  for (const group of groups) {
    const name = group.name || group.model || "UNKNOWN";
    console.log("");
    console.log(" [ " + name + " ]");

    // ดึง limits/buckets
    let limits = [];
    if (Array.isArray(group.buckets)) {
      limits = group.buckets.map(b => ({
        label: b.name ? b.name.replace(" Limit Remaining", "") : (b.window || "Quota"),
        remaining: b.disabled ? null : (b.remaining_fraction !== undefined ? b.remaining_fraction * 100 : null),
        disabled: !!b.disabled,
        reset: formatResetTime(b.reset_time)
      }));
    } else if (Array.isArray(group.limits)) {
      limits = group.limits;
    } else {
      limits = [
        { label: "Weekly", remaining: group.weekly_remaining, reset: formatResetTime(group.weekly_reset) },
        { label: "5-Hour", remaining: group.five_hour_remaining, reset: formatResetTime(group.five_hour_reset) }
      ];
    }

    for (const lim of limits) {
      if (lim.disabled) {
        const label = (lim.label + ":").padEnd(12);
        console.log(`  ${label}   N/A (Disabled)`);
        continue;
      }
      if (lim.remaining === undefined || lim.remaining === null) continue;

      const pct = Number(lim.remaining);
      const pctStr = (pct.toFixed(1) + "%").padStart(6);
      const resetStr = lim.reset ? `  (reset: ${lim.reset})` : "";
      const label = (lim.label + ":").padEnd(12);

      console.log(`  ${label} ${pctStr}${resetStr}`);
    }
  }

  console.log("");
  console.log(line);
  console.log(" กด Ctrl+C เพื่อออก");
}

// ---------- เริ่มทำงาน ----------
render();
if (!process.argv.includes("--once")) {
  setInterval(render, REFRESH_MS);
}
