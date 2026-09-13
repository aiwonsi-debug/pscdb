const fs = require('fs');

const files = [
  'E:/agy/ops_mobile_web.html',
  'E:/agy/render-dashboard/ops_mobile_web.html'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');

    // Replace CSS variables
    const oldRoot = `:root {
      --bg: #090d16;
      --card-bg: #131c2e;
      --card-border: #23334d;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --line-green: #06c755;
      --salaya-purple: #a855f7;
      --tns-cyan: #06b6d4;
    }`;

    const newRoot = `:root {
      --bg: #181a1b;
      --card-bg: #1d2125;
      --card-border: #35393b;
      --text-main: #e8e6e3;
      --text-muted: #9e9689;
      --primary: #3391b8;
      --accent-orange: #e85a3c;
      --success: #2b9348;
      --warning: #d48806;
      --danger: #d93838;
      --line-green: #06c755;
      --salaya-purple: #9d4edd;
      --tns-cyan: #2aa198;
    }`;

    if (content.includes('--bg: #090d16;')) {
      content = content.replace(oldRoot, newRoot);
    }

    // Enhance header and title to match Dark Reader orange brand accent
    content = content.replace(/color: var\(--primary\);/g, 'color: #e85a3c;');
    content = content.replace(/background: #131c2e;/g, 'background: #1d2125;');
    content = content.replace(/background: #090d16;/g, 'background: #141718;');
    content = content.replace(/border: 1px solid #334155;/g, 'border: 1px solid #35393b;');
    content = content.replace(/border: 1px solid #23334d;/g, 'border: 1px solid #35393b;');
    content = content.replace(/color: #38bdf8;/g, 'color: #3391b8;');
    content = content.replace(/color: #34d399;/g, 'color: #48bb78;');

    // Update active tab buttons style
    content = content.replace(/\.tab-btn\.active \{ background: var\(--primary\); color: #090d16; font-weight: 700; border-color: var\(--primary\); \}/g,
      '.tab-btn.active { background: #3391b8; color: #ffffff; font-weight: 700; border-color: #3391b8; }');
    
    content = content.replace(/\.nav-tab-btn\.active \{ background: var\(--primary\); color: #090d16; font-weight: 700; box-shadow: 0 2px 8px rgba\(56, 189, 248, 0.4\); \}/g,
      '.nav-tab-btn.active { background: #3391b8; color: #ffffff; font-weight: 700; box-shadow: 0 2px 8px rgba(51, 145, 184, 0.4); }');

    fs.writeFileSync(file, content, 'utf8');
    console.log('Applied Dark Reader Theme to:', file);
  }
});
