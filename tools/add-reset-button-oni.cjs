const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src/templates/actors/oni-template.json');
const t = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const tab = t.system.body.contents[4].contents[1];

// Add reset button as new content
tab.contents.push({
  key: 'na_oni_reset_ficha',
  colSpan: 1,
  rowSpan: 1,
  cssClass: '',
  role: 0,
  editRole: 0,
  permission: 0,
  tooltip: 'Reseta dano, cura e recursos temporários. Nível, progressão e itens são preservados.',
  visibilityFormula: '',
  editableFormula: '',
  escapeHTML: false,
  type: 'label',
  size: 'full-size',
  icon: '',
  value: '<span class="na-sheet-text na-sheet-label na-sheet-size-md">RESETAR FICHA</span>',
  prefix: '',
  suffix: '',
  rollMessage: "%{await game.modules.get('night-assassins-csb-automation')?.api?.resetSheet(entity); return '';}%",
  altRollMessage: '',
  rollMessageToChat: false,
  altRollMessageToChat: false,
  style: 'button'
});

fs.writeFileSync(filePath, JSON.stringify(t, null, 2));
console.log('Added reset button to Oni template');
console.log('Contents count now:', tab.contents.length);
