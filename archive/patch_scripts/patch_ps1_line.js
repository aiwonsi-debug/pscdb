const fs = require('fs');
const file = 'E:/agy/Alert-TNSPreparation.ps1';
let content = fs.readFileSync(file, 'utf8');

// replace Send-TGAlert calls to also include Line calls
const regex = /if \(\$botToken -and \$chatId\) \{\s*Send-TGAlert -botToken \$botToken -chatId \$chatId -message \$msg\s*Write-Output "✅ Sent TG Alert for \$\(\$al.Key\)"\s*\}/g;

const replacementStr = `if ($botToken -and $chatId) {
                Send-TGAlert -botToken $botToken -chatId $chatId -message $msg
                Write-Output "✅ Sent TG Alert for $($al.Key)"
            }
            try {
                $nodeScript = "require('E:/agy/line_notifier.js').sendLineMessage(process.env.LINE_MSG);"
                $env:LINE_MSG = $msg
                node -e $nodeScript
                Write-Output "✅ Sent LINE Alert for $($al.Key)"
            } catch {
                Write-Output "⚠️ Failed to send LINE Alert"
            }`;

if (content.includes('node -e $nodeScript')) {
    console.log('Already patched PS1');
} else {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Patched PS1');
}
