const fs = require('fs');

const dataFile = 'E:/agy/team_ops_status.json';
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

if (data.cards_state.salaya_0209) {
    data.cards_state.salaya_0209.loadedItem = '????????? ????????';
    data.cards_state.salaya_0209.transitLoss = '215 kg (2.47%)';
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log('Updated team_ops_status.json for salaya_0209');
}

const renderDataFile = 'E:/agy/render-dashboard/team_ops_status.json';
if (fs.existsSync(renderDataFile)) {
    fs.writeFileSync(renderDataFile, JSON.stringify(data, null, 2));
    console.log('Updated render-dashboard/team_ops_status.json');
}

