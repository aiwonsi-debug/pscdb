from pathlib import Path

root = Path('/home/ubuntu/pscdb')
new_gas = 'https://script.google.com/macros/s/AKfycbz4ro2cYV1FC4EvJiX42D2BDAD33ccARs8LbGm8G59gJA323CbJPdIimWRQvd1gES4j/exec'
old_gas = 'https://script.google.com/macros/s/AKfycbycakKFmkwBWkMkfOenwDycc3w9MxpwUw33i5MR5-eOR2kqyLGxQP34TMxDVd3BSJU2/exec'

for rel in ['render-dashboard/server.js', 'webhook_server.js']:
    p = root / rel
    s = p.read_text()
    if old_gas not in s:
        raise SystemExit(f'old GAS URL not found in {p}')
    p.write_text(s.replace(old_gas, new_gas))

old = "renderStock({AsOfDate:wdb.timestamp,demandByDate:wdb.demandByDate||{},demandSource:wdb.demandSource,Items:Object.fromEntries((wdb.stock||[]).map(x=>[x.code,{Name:x.name,StockKg:x.actualQtyKg}]))})"
new = "renderStock({AsOfDate:wdb.timestamp,demandByDate:wdb.demandByDate||{},intakeByDate:wdb.intakeByDate||{},demandSource:wdb.demandSource,Items:Object.fromEntries((wdb.stock||[]).map(x=>[x.code,{Name:x.name,StockKg:Number(x.actualQtyKg)||0}]))})"
for rel in ['public/ops.html', 'render-dashboard/public/ops.html']:
    p = root / rel
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'Forecast render call not found in {p}')
    p.write_text(s.replace(old, new))

print('patched GAS URL and Forecast intake wiring')
print(new_gas)
