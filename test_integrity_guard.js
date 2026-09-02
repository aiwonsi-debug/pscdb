const engine = require('./excel_integrity_engine.js');
const path = require('path');

const targetFile = 'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx';

console.log('================================================================');
console.log('   🛡️ EXCEL INTEGRITY & SELF-RECONCILIATION VERIFICATION TEST');
console.log('================================================================');
console.log(`Auditing file: ${targetFile}`);

try {
    const result = engine.parseAndVerifySheet(targetFile, 'Sep-26');
    
    console.log(`\nSheet Name: ${result.sheetName}`);
    console.log(`Reconciliation Passed: ${result.isReconciled ? '✅ YES (ZERO ERROR)' : '❌ FAILED'}`);
    
    console.log('\n--- Column Total Reconciliation Report (Row 34 vs Calculated Sum) ---');
    console.table(result.verificationReport);

    console.log('\n--- Verified Active Order Days Count ---');
    console.log(`Total active delivery days: ${result.dailyOrders.length} days`);
    
    if (result.isReconciled) {
        console.log('\n🎉 ALL COLUMNS AND SUMS RECONCILED WITH 100% MATHEMATICAL PRECISION!');
    } else {
        console.error('\n🚨 DISCREPANCY DETECTED IN FILE! SYSTEM MUST BLOCK OUTPUT.');
    }
} catch (e) {
    console.error('Integrity audit error:', e.message);
}
