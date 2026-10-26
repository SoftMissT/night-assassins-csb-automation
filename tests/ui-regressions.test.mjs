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
  // A janela cresce com o conteúdo: altura fixa em viewport cortava o rodapé do DialogV2.
  assert.doesNotMatch(css, /\.na-dmg-window\s*\{[^}]*(?<![-\w])height:/isu);
  assert.doesNotMatch(css, /\.na-dmg-window[^{]*\{[^}]*calc\(100vh/isu);
  assert.match(css, /\.na-dmg-window\s*\{[^}]*display:\s*flex/isu);
  // DOM real do DialogV2: .window-content > form.dialog-form > (.dialog-content + footer.form-footer).
  // O form é flex-column com overflow visível: sem min-height:0 em cada elo o rodapé é cortado.
  assert.match(css, /\.na-dmg-window \.dialog-form\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/isu);
  assert.match(css, /\.na-dmg-window \.dialog-form\s*\{[^}]*display:\s*flex/isu);
  assert.match(css, /\.na-dmg-window \.dialog-content,[^{]*\{[^}]*min-height:\s*0/isu);
  assert.match(css, /\.na-dmg-window \.na-dmg-dialog\s*\{[^}]*display:\s*flex/isu);
  assert.match(css, /\.na-dmg-window \.na-dmg-dialog\s*\{[^}]*min-height:\s*0/isu);
  assert.match(css, /\.na-dmg-window \.na-dmg-dialog\s*\{[^}]*overflow:\s*hidden/isu);
  assert.match(css, /\.na-dmg-window \.form-footer\s*\{[^}]*flex:\s*0 0 auto/isu);
  // Só a lista de entradas encolhe e rola.
  assert.match(css, /\.na-dmg-window #na-entradas-container\s*\{[^}]*flex:\s*0 1 auto/isu);
  assert.match(css, /\.na-dmg-window #na-entradas-container\s*\{[^}]*overflow-y:\s*auto/isu);
});

test('diálogo de dano re-ajusta a janela pelo setPosition do core quando o conteúdo muda', async () => {
    const dialog = await read('scripts/dialogs/damage-dialog.mjs');
    assert.match(dialog, /app:\s*dialog/u);
    assert.match(dialog, /new ResizeObserver\(/u);
    assert.match(dialog, /app\.position\?\.height === 'auto'/u);
    assert.match(dialog, /app\.setPosition\(\{ height: 'auto' \}\)/u);
});

test('diálogo de dano permite excluir preset com confirmação inline', async () => {
    const [dialog, service] = await Promise.all([
        read('scripts/dialogs/damage-dialog.mjs'),
        read('scripts/damage-service.mjs'),
    ]);
    assert.match(dialog, /id="na-delete-preset-btn"[^>]*disabled/u);
    assert.match(dialog, /id="na-delete-preset-panel" role="alertdialog"/u);
    assert.match(dialog, /await options\.onDeletePreset\(id\)/u);
    assert.match(service, /onDeletePreset:\s*async \(id\)/u);
    assert.match(service, /deleteDamagePreset\(actor, id\)/u);
});

test('cor do atributo no diálogo de dano mantém contraste (piso de luminosidade OKLCH)', async () => {
    const [dialog, css] = await Promise.all([
        read('scripts/dialogs/damage-dialog.mjs'),
        read('styles/na-csb-automation.css'),
    ]);
    // A cor sai do style inline (que não dá para sobrescrever) e vira variável.
    assert.doesNotMatch(dialog, /class="na-attr-key" style="color:/u);
    assert.match(dialog, /class="na-attr-key" style="--na-attr-color:/u);
    assert.match(css, /\.na-attr-key\s*\{[^}]*color:\s*var\(--na-attr-color[^}]*color:\s*oklch\(from var\(--na-attr-color/isu);
});

test('Controle GM respeita a largura útil do viewport estreito', async () => {
    const css = await read('styles/na-csb-automation.css');
    assert.match(
        css,
        /\.na-gm-dashboard-window\s*\{[^}]*min-width:\s*min\(480px,\s*calc\(100vw - 40px\)\)/isu
    );
    assert.doesNotMatch(css, /@media\s*\(max-width:\s*620px\)[\s\S]*?min-width:\s*360px/isu);
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
