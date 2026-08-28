const fs = require('fs');
const t = JSON.parse(fs.readFileSync('src/templates/actors/oni-template.json', 'utf8'));
const json = JSON.stringify(t, null, 2);
const lines = json.split('\n');
let currentField = '';
const results = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const fieldMatch = line.match(/"(pdv_oni_nvl\d+)"/);
  if (fieldMatch) currentField = fieldMatch[1];
  if (currentField && line.match(/"value".*pdv_oni_nvl/)) {
    const formula = line.match(/"value":\s*"(.+?)"/);
    if (formula) {
      results.push({ field: currentField, formula: formula[1] });
      currentField = '';
    }
  }
}
results.sort((a, b) => {
  const na = parseInt(a.field.match(/\d+/)[0]);
  const nb = parseInt(b.field.match(/\d+/)[0]);
  return na - nb;
});
console.log('=== PDV CHAIN ANALYSIS ===\n');
results.forEach(r => {
  const chainRef = r.formula.match(/pdv_oni_nvl(\d+)/);
  const chainLevel = chainRef ? parseInt(chainRef[1]) : 0;
  const expected = parseInt(r.field.match(/\d+/)[0]) - 1;
  const ok = chainLevel === expected ? 'OK' : 'BROKEN expected pdv_oni_nvl' + expected;
  console.log(r.field + ' -> chain=' + chainLevel + ' ' + ok);
  console.log('  formula: ' + r.formula);
});
