const fs = require('fs');
const file = 'E:/agy/Alert-TNSPreparation.ps1';
let content = fs.readFileSync(file, 'utf8');

const target = 'Send-TGAlert -botToken $botToken -chatId $chatId -message $msg\n                $notified[$al.Key] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")';

const replacement = `Send-TGAlert -botToken $botToken -chatId $chatId -message $msg
                try {
                    $env:LINE_MSG = $msg
                    node -e "require('E:/agy/line_notifier.js').sendLineMessage(process.env.LINE_MSG);"
                } catch {}
                $notified[$al.Key] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")`;

// Try both \n and \r\n
content = content.replace(target, replacement);
content = content.replace(target.replace('\n', '\r\n'), replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Done PS1 line patch');
