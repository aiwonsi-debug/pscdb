#!/usr/bin/env node
"use strict";
/**
 * audit-duplicate-logic.js
 *
 * ตรวจจับไฟล์ .js ที่มี logic ซ้ำซ้อนกันในโปรเจกต์ ทั้งแบบ:
 *   1) exact duplicate   — เนื้อหาเหมือนกันทุกตัวอักษร (หลังตัด whitespace/comment)
 *   2) divergent duplicate — export ชื่อฟังก์ชันชุดเดียวกัน แต่เนื้อหาต่างกัน
 *      (สัญญาณอันตรายสุด เพราะ logic คำนวณอาจให้ผลไม่ตรงกันระหว่างไฟล์)
 *
 * การทำงาน:
 *   node scripts/audit-duplicate-logic.js            → แสดงรายงานอย่างเดียว
 *   node scripts/audit-duplicate-logic.js --fix       → แปลงไฟล์ duplicate ที่ "รอง"
 *                                                        ให้เป็น re-export shim ชี้ไปไฟล์ "หลัก" อัตโนมัติ
 *                                                        (ทำเฉพาะกรณี exact duplicate เท่านั้น
 *                                                         divergent duplicate ต้องตัดสินใจเอง จะไม่ auto-fix)
 *
 * เกณฑ์เลือกไฟล์ "หลัก" (canonical) เมื่อพบ exact duplicate:
 *   - ไฟล์ที่ path สั้นกว่า/อยู่ระดับบนกว่า (ใกล้ root) ถือเป็นหลัก
 *   - ถ้าอยู่ระดับเดียวกัน ใช้ไฟล์ที่ถูก require มากที่สุดในโปรเจกต์เป็นหลัก
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.existsSync(path.join(__dirname, "package.json")) ? __dirname : path.resolve(__dirname, "..");
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "archive", "backups",
  ".tmp.drivedownload", ".tmp.driveupload", "received_images",
  "data", "public", "reports", "secrets"
]);
const APPLY_FIX = process.argv.includes("--fix");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function normalize(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")   // ตัด block comment
    .replace(/^\s*\/\/.*$/gm, "")        // ตัด line comment
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function hashOf(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function extractExportedNames(content) {
  // จับชื่อฟังก์ชัน/ค่าที่อยู่ใน module.exports = { ... }
  const m = content.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
  if (!m) return null;
  const names = m[1]
    .split(",")
    .map(s => s.trim().split(/[:\s]/)[0].trim())
    .filter(Boolean)
    .sort();
  return names.length ? names.join(",") : null;
}

function countRequires(allFiles, targetBasename) {
  let count = 0;
  for (const f of allFiles) {
    const content = fs.readFileSync(f, "utf8");
    const re = new RegExp(`require\\((['"\`])[^'"\`]*${targetBasename.replace(".js", "")}(\\.js)?\\1\\)`, "g");
    const matches = content.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function loadKnownSyncPairs() {
  // อ่านรายชื่อไฟล์จาก sync_render_dashboard.sh ถือเป็นคู่ deploy-copy ที่ตั้งใจให้เหมือนกัน
  // ไม่ใช่ duplicate ที่ต้องรวมไฟล์ (render-dashboard/ เป็น deploy target แยก ใช้ require ข้ามไม่ได้)
  const scriptPath = path.join(ROOT, "sync_render_dashboard.sh");
  const known = new Set();
  if (!fs.existsSync(scriptPath)) return known;
  const content = fs.readFileSync(scriptPath, "utf8");
  const block = content.match(/FILES=\(([\s\S]*?)\)/);
  if (!block) return known;
  for (const line of block[1].split("\n")) {
    const m = line.match(/"([^"]+)"/);
    if (!m) continue;
    // รองรับรูปแบบ "src.js" หรือ "src.js:dest.js" (ชื่อไฟล์ต่างกันระหว่าง root กับ render-dashboard)
    for (const part of m[1].split(":")) {
      if (part.endsWith(".js")) known.add(part);
    }
  }
  return known;
}

function main() {
  const files = walk(ROOT);
  const knownSyncPairs = loadKnownSyncPairs();
  const records = files.map(f => {
    const raw = fs.readFileSync(f, "utf8");
    const norm = normalize(raw);
    return {
      file: path.relative(ROOT, f),
      abs: f,
      hash: hashOf(norm),
      exportedNames: extractExportedNames(raw),
      depth: path.relative(ROOT, f).split(path.sep).length,
    };
  });

  // --- 1) exact duplicate: group by hash ---
  const byHash = new Map();
  for (const r of records) {
    if (!byHash.has(r.hash)) byHash.set(r.hash, []);
    byHash.get(r.hash).push(r);
  }
  const allExactGroups = [...byHash.values()].filter(g => g.length > 1);
  const exactGroups = allExactGroups.filter(
    g => !g.some(r => knownSyncPairs.has(path.basename(r.file)))
  );
  const syncedGroups = allExactGroups.filter(
    g => g.some(r => knownSyncPairs.has(path.basename(r.file)))
  );

  // --- 2) divergent duplicate: same exported-name signature, different hash ---
  const bySignature = new Map();
  for (const r of records) {
    if (!r.exportedNames) continue;
    if (!bySignature.has(r.exportedNames)) bySignature.set(r.exportedNames, []);
    bySignature.get(r.exportedNames).push(r);
  }
  const divergentGroups = [...bySignature.values()]
    .filter(g => g.length > 1 && new Set(g.map(r => r.hash)).size > 1);

  console.log("=== ตรวจสอบไฟล์ logic ซ้ำซ้อน ===");
  console.log(`สแกนไฟล์ .js ทั้งหมด: ${records.length} ไฟล์ (ไม่รวม ${[...EXCLUDE_DIRS].join(", ")})\n`);

  if (syncedGroups.length > 0) {
    console.log(`[deploy-sync copy — ไม่ใช่ปัญหา] ${syncedGroups.length} กลุ่ม ตรงกับ sync_render_dashboard.sh อยู่แล้ว และเนื้อหาตรงกันในขณะนี้:`);
    for (const g of syncedGroups) {
      console.log(`  - ${g.map(x => x.file).join("  <->  ")}  (in sync)`);
    }
    console.log("");
  }

  if (exactGroups.length === 0) {
    console.log("[exact duplicate] ไม่พบ\n");
  } else {
    console.log(`[exact duplicate] พบ ${exactGroups.length} กลุ่ม:`);
    for (const g of exactGroups) {
      g.sort((a, b) => a.depth - b.depth);
      const canonical = g[0];
      console.log(`  - เนื้อหาเหมือนกัน: ${g.map(x => x.file).join("  <->  ")}`);
      console.log(`    เสนอให้ "${canonical.file}" เป็นไฟล์หลัก`);
      if (APPLY_FIX) {
        for (const dup of g.slice(1)) {
          const relImport = path.relative(path.dirname(dup.abs), canonical.abs)
            .split(path.sep).join("/");
          const stub =
            `// Re-export shim สร้างโดย audit-duplicate-logic.js --fix\n` +
            `// เนื้อหาซ้ำกับ ${canonical.file} ทุกตัวอักษร — รวมเป็นแหล่งเดียวเพื่อกัน logic drift\n` +
            `module.exports = require(${JSON.stringify(relImport.startsWith(".") ? relImport : "./" + relImport)});\n`;
          fs.writeFileSync(dup.abs, stub, "utf8");
          console.log(`    [fixed] เขียนทับ ${dup.file} ให้เป็น re-export shim แล้ว`);
        }
      }
    }
    console.log("");
  }

  if (divergentGroups.length === 0) {
    console.log("[divergent duplicate] ไม่พบ\n");
  } else {
    console.log(`[divergent duplicate] พบ ${divergentGroups.length} กลุ่ม (ต้องตรวจสอบเอง ไม่ auto-fix):`);
    for (const g of divergentGroups) {
      console.log(`  - export ชื่อเดียวกัน (${g[0].exportedNames}) แต่เนื้อหาต่างกัน:`);
      for (const r of g) console.log(`      ${r.file}`);
    }
    console.log("");
  }

  if (exactGroups.length === 0 && divergentGroups.length === 0) {
    console.log("สรุป: ไม่พบ logic ซ้ำซ้อนที่ต้องแก้ไขในขณะนี้");
  } else if (!APPLY_FIX && exactGroups.length > 0) {
    console.log("รัน `node scripts/audit-duplicate-logic.js --fix` เพื่อรวม exact duplicate อัตโนมัติ");
  }

  process.exitCode = (exactGroups.length > 0 || divergentGroups.length > 0) ? 1 : 0;
}

main();

