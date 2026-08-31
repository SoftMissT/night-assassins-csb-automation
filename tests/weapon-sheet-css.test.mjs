import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const mainSource = await readFile(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
const cssSource = await readFile(
    new URL('../styles/na-csb-automation.css', import.meta.url),
    'utf8'
);
const weaponTemplate = JSON.parse(
    await readFile(new URL('../src/templates/items/slayer-weapon-template.json', import.meta.url), 'utf8')
);
const specialTemplate = JSON.parse(
    await readFile(
        new URL('../src/templates/items/special-slayer-weapon-template.json', import.meta.url),
        'utf8'
    )
);

function walkComponents(value, visit) {
    if (!value || typeof value !== 'object') return;
    visit(value);
    for (const child of value.contents ?? []) walkComponents(child, visit);
}

describe('skin Arsenal Nichirin do ItemSheet', () => {
    it('marca ItemSheets normal e especial sem remover o comportamento dos Actors', () => {
        assert.match(mainSource, /NAWeaponTpl00001/);
        assert.match(mainSource, /NASpecialWeaponTpl00001/);
        assert.match(mainSource, /na-item-sheet/);
        assert.match(mainSource, /na-weapon-sheet/);
        assert.match(mainSource, /na-special-weapon-sheet/);
        assert.match(mainSource, /Hooks\.on\('renderItemSheet', tagNightAssassinsSheet\)/);
        assert.match(mainSource, /Hooks\.on\('renderItemSheetV2', tagNightAssassinsSheet\)/);
        assert.match(mainSource, /Hooks\.on\('renderActorSheet', tagNightAssassinsSheet\)/);
        assert.match(mainSource, /Hooks\.on\('renderActorSheetV2', tagNightAssassinsSheet\)/);
        assert.match(mainSource, /Hooks\.on\('renderApplicationV2'/);
    });

    it('aplica classes semânticas e remove somente os três espaçadores do body', () => {
        const classes = new Set();
        walkComponents(weaponTemplate.system.header, (component) => {
            for (const name of String(component.cssClass ?? '').split(/\s+/).filter(Boolean)) {
                classes.add(name);
            }
        });
        walkComponents(weaponTemplate.system.body, (component) => {
            for (const name of String(component.cssClass ?? '').split(/\s+/).filter(Boolean)) {
                classes.add(name);
            }
        });

        for (const expected of [
            'na-weapon-identity',
            'na-weapon-stats',
            'na-weapon-wielder',
            'na-weapon-attack',
            'na-weapon-description',
            'na-weapon-rules',
        ]) {
            assert.ok(classes.has(expected), `classe semântica ausente: ${expected}`);
        }

        const emptyBodyPanels = weaponTemplate.system.body.contents.filter(
            (component) => component.type === 'panel' && component.contents?.length === 0
        );
        assert.equal(emptyBodyPanels.length, 0);
        assert.equal(
            weaponTemplate.system.header.contents.filter(
                (component) => component.type === 'panel' && component.contents?.length === 0
            ).length,
            1,
            'o painel estrutural do header não é um dos três espaçadores do body'
        );

        const serialized = JSON.stringify(weaponTemplate.system);
        assert.match(serialized, /rollWeaponItem/);
        assert.match(serialized, /startWithHit/);
        assert.doesNotMatch(serialized, /return '';return '';/);
        assert.match(serialized, /return '';/);
    });

    it('não injeta a estrutura normal no template especial', () => {
        const serialized = JSON.stringify(specialTemplate.system);
        assert.doesNotMatch(
            serialized,
            /na-weapon-identity|na-weapon-stats|na-weapon-wielder|na-weapon-attack|na-weapon-description|na-weapon-rules/
        );
    });

    it('mantém o CSS estritamente escopado, acessível e responsivo', () => {
        const start = cssSource.indexOf('/* Arsenal Nichirin: início */');
        const end = cssSource.indexOf('/* Arsenal Nichirin: fim */');
        assert.ok(start >= 0 && end > start, 'bloco Arsenal Nichirin delimitado');
        const arsenal = cssSource.slice(start, end);

        assert.match(arsenal, /\.na-item-sheet\.na-weapon-sheet/);
        assert.match(arsenal, /#090a0f/i);
        assert.match(arsenal, /#121722/i);
        assert.match(arsenal, /#384152/i);
        assert.match(arsenal, /#f5f0e8/i);
        assert.match(arsenal, /#a8b0bc/i);
        assert.match(arsenal, /#52d9ff/i);
        assert.match(arsenal, /:focus-visible/);
        assert.match(arsenal, /@media \(max-width:/);
        assert.match(arsenal, /@media \(prefers-reduced-motion: reduce\)/);
        assert.doesNotMatch(arsenal, /!important/);
        assert.doesNotMatch(arsenal, /\[class\*=/);
        assert.doesNotMatch(arsenal, /:has\(/);
        assert.doesNotMatch(arsenal, /\.na-(?:oni|slayer)-sheet/);

        for (const rawLine of arsenal.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line.endsWith('{') || line.startsWith('@')) continue;
            for (const selector of line.slice(0, -1).split(',')) {
                assert.match(
                    selector.trim(),
                    /^\.na-item-sheet\.na-weapon-sheet\b/,
                    `seletor fora do escopo da arma normal: ${selector.trim()}`
                );
            }
        }
    });
});
