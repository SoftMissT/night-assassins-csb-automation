const fs = require('fs');
const path = require('path');

// Read the source template
const srcPath = 'src/templates/actors/oni-template.json';
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

// Extract all pdv_oni_nvlN formulas
const json = JSON.stringify(src, null, 2);
const lines = json.split('\n');

const formulas = [];
let currentField = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const fieldMatch = line.match(/"(pdv_oni_nvl\d+)"/);
  if (fieldMatch) currentField = fieldMatch[1];
  
  if (currentField && line.match(/"value".*\$\{.*pdv_oni_nvl/)) {
    const formulaMatch = line.match(/"value":\s*"(.+?)"/);
    if (formulaMatch) {
      formulas.push({ field: currentField, formula: formulaMatch[1] });
      currentField = '';
    }
  }
}

// Sort by level
formulas.sort((a, b) => {
  const na = parseInt(a.field.match(/\d+/)[0]);
  const nb = parseInt(b.field.match(/\d+/)[0]);
  return na - nb;
});

console.log('=== PDV ONI FORMULA AUDIT ===\n');
console.log('Rule: pdv_oni_nvlN must use vit_oni_nvlN (same level)\n');

const errors = [];

for (const { field, formula } of formulas) {
  const level = parseInt(field.match(/\d+/)[0]);
  
  // Check chain reference (should be pdv_oni_nvl(N-1))
  const chainRef = formula.match(/pdv_oni_nvl(\d+)/);
  const chainLevel = chainRef ? parseInt(chainRef[1]) : 0;
  const chainOk = chainLevel === level - 1;
  
  // Check VIT reference (should be vit_oni_nvlN)
  const vitRefs = [...formula.matchAll(/vit_oni_nvl(\d+)/g)].map(m => parseInt(m[1]));
  const vitOk = vitRefs.every(v => v === level);
  
  const status = chainOk && vitOk ? '✅' : '❌';
  
  console.log(`${status} ${field}`);
  console.log(`   Chain: pdv_oni_nvl${chainLevel} ${chainOk ? 'OK' : 'WRONG (expected ' + (level-1) + ')'}`);
  console.log(`   VIT: vit_oni_nvl${vitRefs.join(', vit_oni_nvl')} ${vitOk ? 'OK' : 'WRONG (expected vit_oni_nvl' + level + ')'}`);
  console.log(`   Formula: ${formula}`);
  
  if (!chainOk || !vitOk) {
    errors.push({ field, level, chainLevel, chainOk, vitRefs, vitOk, formula });
  }
  
  console.log('');
}

console.log(`\n=== SUMMARY ===`);
console.log(`Total formulas: ${formulas.length}`);
console.log(`Errors found: ${errors.length}`);

if (errors.length > 0) {
  console.log('\n=== ERRORS TO FIX ===');
  for (const err of errors) {
    console.log(`\n${err.field}:`);
    if (!err.chainOk) {
      console.log(`  Chain: uses pdv_oni_nvl${err.chainLevel}, should be pdv_oni_nvl${err.level - 1}`);
    }
    if (!err.vitOk) {
      console.log(`  VIT: uses vit_oni_nvl${err.vitRefs.join(',')}, should be vit_oni_nvl${err.level}`);
    }
  }
}
