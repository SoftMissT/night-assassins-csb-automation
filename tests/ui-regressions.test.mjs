import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('diálogo de dano mantém os controles fora do scroll das entradas', async () => {
    const [dialog, css] = await Promise.all([
        read('scripts/dialogs/damage-dialog.mjs'),
        read('styles/na-csb-automation.css'),
  ]);
  assert.match(dialog, /contentClasses:\s*\['na-dmg-window'\]/u);
  assert.match(css, /\.na-dmg-window\s*\{[^}]*height:\s*calc\(100vh - 40px\)/isu);
  assert.match(css, /\.na-dmg-window\s*\{[^}]*display:\s*flex/isu);
  assert.match(css, /\.na-dmg-window \.na-dmg-dialog\s*\{[^}]*display:\s*flex/isu);
  assert.match(css, /\.na-dmg-window #na-entradas-container\s*\{[^}]*overflow-y:\s*auto/isu);
  assert.match(css, /\.na-dmg-window \.dialog-content,\s*\.na-dmg-window > \.dialog-content\s*\{[^}]*min-height:\s*0/isu);
    assert.match(css, /\.na-dmg-window \.na-dmg-dialog\s*\{[^}]*overflow:\s*hidden/isu);
});

test('template de Forma não exibe campo japonês nem campo vazio', async () => {
    const template = JSON.parse(await read('src/templates/items/breathing-form-template.json'));
    const serialized = JSON.stringify(template);
  assert.match(serialized, /"key":"nome_jp"[^}]*"visibilityFormula":"false"/u);
  assert.doesNotMatch(serialized, /\$\{nome_jp\}\$/u);
    assert.doesNotMatch(
        serialized,
        /"key":""[^}]*"type":"textField"[^}]*"label":""/u
    );
});
