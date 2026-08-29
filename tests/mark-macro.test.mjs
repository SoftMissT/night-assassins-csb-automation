import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const macro = fs.readFileSync(new URL('../macros/na-marca-cacador.js', import.meta.url), 'utf8');
const template = JSON.parse(
    fs.readFileSync(
        new URL('../src/templates/actors/slayer-template.json', import.meta.url),
        'utf8'
    )
);
const templateSource = JSON.stringify(template);
const attributes = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];

test('Marca lê os valores finais display antes das fontes legadas', () => {
    const functionSource = macro.slice(
        macro.indexOf('function attribute'),
        macro.indexOf('function isDestinyMark')
    );
    assert.ok(
        functionSource.indexOf('`${key}_display`') <
            functionSource.indexOf('`atr_${key}_valor_config`')
    );
    assert.ok(
        functionSource.indexOf('`atr_${key}_valor_config`') <
            functionSource.indexOf('`atr_${key}_valor`')
    );
    assert.match(macro, /replace\(\/<style\\b\[\^>\]\*>\[\\s\\S\]\*\?<\\\/style>\/gi/);
});

test('Marca escreve os sete temporários e cada display consome seu temporário', () => {
    for (const key of attributes) {
        assert.match(macro, new RegExp(`system\\.props\\.\\$\\{key\\}_marca_temp`));
        assert.match(
            templateSource,
            new RegExp(`"name":"${key}_display","value":"[^"]*${key}_marca_temp`)
        );
    }
});

test('Marca integra a reativação opcional da Resiliência em um único update', () => {
    const activationSource = macro.slice(
        macro.indexOf('async function activate'),
        macro.indexOf('async function finish')
    );
    assert.match(macro, /buildStoneMarkReactivation/);
    assert.match(macro, /game\.combat/);
    assert.match(macro, /forma_id/);
    assert.match(activationSource, /stoneReactivation\?\.patch/);
    assert.equal((activationSource.match(/await actor\.update/g) ?? []).length, 1);
    assert.doesNotMatch(activationSource, /consumeSlayerActions/);
});

test('Marca aguarda o Dice So Nice antes de processar o resultado da rolagem', () => {
    assert.match(macro, /async function rollVisible/);
    assert.match(macro, /await roll\.toMessage/);
    assert.match(macro, /await game\.dice3d\?\.waitFor3DAnimationByMessageID\?\./);
    assert.match(macro, /await rollVisible\(\s*`1d20/);
    assert.match(macro, /await rollVisible\(\s*`1d100/);
});
