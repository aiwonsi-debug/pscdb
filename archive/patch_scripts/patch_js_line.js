const fs = require('fs');
const file = 'E:/agy/cloud_secretary/modules/alertScheduler.js';
let content = fs.readFileSync(file, 'utf8');

// Ensure sendLineMessage is required
if (!content.includes("const { sendLineMessage } = require('../../line_notifier.js');")) {
  content = content.replace(
    "const { sendMessage } = require('./telegramService');",
    "const { sendMessage } = require('./telegramService');\nconst { sendLineMessage } = require('../../line_notifier.js');"
  );
}

// Ensure sendMessage is followed by sendLineMessage
// The code has: sendMessage(msg).then(() => { ... })
// We want: Promise.all([sendMessage(msg), sendLineMessage(msg)]).then(() => { ... })
// Or just: sendMessage(msg).then(...); sendLineMessage(msg);

const regex = /sendMessage\(msg\)\.then\(\(\) => \{([^}]+)\}\)\.catch\([^)]+\);/g;

// Instead of regex, I will do string replace
content = content.replace(
  "sendMessage(msg).then(() => {",
  "sendLineMessage(msg);\n            sendMessage(msg).then(() => {"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched JS');
