const fs = require('fs');
const path = require('path');

// Read the source template
const srcPath = 'src/templates/actors/oni-template.json';
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

// Fix rules: pdv_oni_nvlN must use vit_oni_nvlN
const fixes = {
  2: { from: 'vit_oni_nvl1', to: 'vit_oni_nvl2' },
  5: { from: 'vit_oni_nvl4', to: 'vit_oni_nvl5' },
  9: { from: 'vit_oni_nvl8', to: 'vit_oni_nvl9' },
  10: { from: 'vit_oni_nvl8', to: 'vit_oni_nvl10' },
  14: { from: 'vit_oni_nvl13', to: 'vit_oni_nvl14' },
  15: { from: 'vit_oni_nvl13', to: 'vit_oni_nvl15' },
  17: { from: 'vit_oni_nvl16', to: 'vit_oni_nvl17' },
  18: { from: 'vit_oni_nvl16', to: 'vit_oni_nvl18' },
  19: { from: 'vit_oni_nvl16', to: 'vit_oni_nvl19' },
  20: { from: 'vit_oni_nvl16', to: 'vit_oni_nvl20' },
};

// Convert to JSON string for replacement
let content = JSON.stringify(src, null, 2);
let fixCount = 0;

for (const [level, { from, to }] of Object.entries(fixes)) {
  // Find the field pdv_oni_nvl{level} and fix its formula
  const field = `pdv_oni_nvl${level}`;
  
  // Find the field in the JSON structure
  const fieldPattern = `"${field}"`;
  const fieldIndex = content.indexOf(fieldPattern);
  
  if (fieldIndex === -1) {
    console.log(`WARNING: Field ${field} not found`);
    continue;
  }
  
  // Find the formula value after this field
  const searchStart = fieldIndex;
  const valuePattern = /"value":\s*"\$\{/g;
  
  // Find the next value pattern after the field
  let match;
  let valueIndex = -1;
  
  // Reset regex
  valuePattern.lastIndex = searchStart;
  
  while ((match = valuePattern.exec(content)) !== null) {
    if (match.index > searchStart) {
      valueIndex = match.index;
      break;
    }
  }
  
  if (valueIndex === -1) {
    console.log(`WARNING: Formula for ${field} not found`);
    continue;
  }
  
  // Check if this formula contains the wrong VIT reference
  const formulaEnd = content.indexOf('"', valueIndex + 10);
  const formula = content.substring(valueIndex, formulaEnd);
  
  if (formula.includes(from)) {
    // Replace the wrong VIT reference with the correct one
    const oldFormula = formula;
    const newFormula = formula.replace(from, to);
    content = content.substring(0, valueIndex) + newFormula + content.substring(formulaEnd);
    console.log(`FIXED: ${field}: ${from} → ${to}`);
    fixCount++;
  } else {
    console.log(`SKIP: ${field} - ${from} not found in formula`);
  }
}

// Parse back to object and write
const fixed = JSON.parse(content);
fs.writeFileSync(srcPath, JSON.stringify(fixed, null, 2) + '\n');

console.log(`\nTotal fixes applied: ${fixCount}`);
