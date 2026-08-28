const fs = require('fs');
const assert = require('assert');

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

console.log('=== PDV ONI CHAIN REGRESSION TEST ===\n');

let passed = 0;
let failed = 0;

for (const { field, formula } of formulas) {
  const level = parseInt(field.match(/\d+/)[0]);
  
  // Test 1: Chain reference must be pdv_oni_nvl(N-1)
  const chainRef = formula.match(/pdv_oni_nvl(\d+)/);
  const chainLevel = chainRef ? parseInt(chainRef[1]) : 0;
  
  try {
    assert.strictEqual(chainLevel, level - 1, `Chain should reference pdv_oni_nvl${level - 1}`);
    console.log(`✅ ${field}: chain=pdv_oni_nvl${chainLevel}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${field}: chain=pdv_oni_nvl${chainLevel} (expected ${level - 1})`);
    failed++;
  }
  
  // Test 2: VIT reference must be vit_oni_nvlN (same level)
  const vitRefs = [...formula.matchAll(/vit_oni_nvl(\d+)/g)].map(m => parseInt(m[1]));
  
  try {
    assert.ok(vitRefs.length > 0, `Should have VIT reference`);
    assert.ok(vitRefs.every(v => v === level), `All VIT refs should be vit_oni_nvl${level}`);
    console.log(`✅ ${field}: vit=vit_oni_nvl${vitRefs.join(',')}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${field}: vit=vit_oni_nvl${vitRefs.join(',')} (expected vit_oni_nvl${level})`);
    failed++;
  }
}

console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
