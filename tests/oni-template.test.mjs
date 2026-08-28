import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { migrateOniTemplate } from '../tools/migrate-oni-template.mjs';

const source = JSON.parse(
    fs.readFileSync(new URL('../src/templates/actors/oni-template.json', import.meta.url), 'utf8')
);
const css = fs.readFileSync(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');

describe('oni-template', () => {
    it('preserva as cores do export oficial contra overrides globais', () => {
        const serialized = JSON.stringify(source.system?.body);
        for (const role of ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab']) {
            assert.match(serialized, new RegExp(`na-sheet-role-${role}`));
            assert.match(
                css,
                new RegExp(`\\.na-oni-sheet \\.window-content \\.na-sheet-role-${role}\\s*\\{`)
            );
        }
        for (const color of ['#ff2638', '#b36cff', '#ffffff', '#ff8c1a']) {
            assert.match(serialized.toLowerCase(), new RegExp(color));
        }
        assert.doesNotMatch(css, /\.na-sheet \.window-content \.na-sheet-label/);
        assert.doesNotMatch(css, /\.na-sheet \.window-content label\s*\{\s*color:\s*#fff/i);
        assert.doesNotMatch(css, /\.na-oni-sheet \.na-sheet-text\s*\{\s*color:/i);
    });

    it('preserva literalmente as 40 fórmulas encadeadas de PDV e PDK fornecidas pelo operador', () => {
        const byKey = new Map();
        const walk = (value) => {
            if (Array.isArray(value)) return value.forEach(walk);
            if (!value || typeof value !== 'object') return;
            if (value.key) byKey.set(value.key, value);
            Object.values(value).forEach(walk);
        };
        walk(source.system);
        const pdv = [
            '${origem_oni_pdv_val + vit_oni_nvl1}$',
            '${pdv_oni_nvl1+(vit_oni_nvl1+origem_oni_pdv_val)+pdv_oni_ganho_nvl2}$',
            '${pdv_oni_nvl2+(vit_oni_nvl3+origem_oni_pdv_val)+pdv_oni_ganho_nvl3}$',
            '${pdv_oni_nvl3+(vit_oni_nvl4+pdv_oni_ganho_nvl4+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl4+(vit_oni_nvl4+pdv_oni_ganho_nvl5+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl5+(vit_oni_nvl6+pdv_oni_ganho_nvl6+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl6+(vit_oni_nvl6+pdv_oni_ganho_nvl6+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl7+(vit_oni_nvl8+pdv_oni_ganho_nvl8+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl8+(vit_oni_nvl8+pdv_oni_ganho_nvl9+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl9+(vit_oni_nvl8+pdv_oni_ganho_nvl10+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl10+(vit_oni_nvl11+pdv_oni_ganho_nvl11+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl11+(vit_oni_nvl12+pdv_oni_ganho_nvl12+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl12+((vit_oni_nvl13*2)+30+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl13+((vit_oni_nvl14*2)+30+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl14+((vit_oni_nvl15*2)+30+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl15+((vit_oni_nvl16*2)+40+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl16+((vit_oni_nvl17*2)+40+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl17+((vit_oni_nvl18*2)+40+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl18+((vit_oni_nvl19*2)+40+origem_oni_pdv_val)}$',
            '${pdv_oni_nvl19+((vit_oni_nvl20*6)+50+origem_oni_pdv_val)}$',
        ];
        const pdk = [
            '${origem_oni_pdk_val+fdv_oni_nvl1}$',
            '${pdk_oni_nvl1+(origem_oni_pdk_val+fdv_oni_nvl1+4)}$',
            '${pdk_oni_nvl2+(origem_oni_pdk_val+fdv_oni_nvl3+4)}$',
            '${pdk_oni_nvl3+(origem_oni_pdk_val+fdv_oni_nvl4+6)}$',
            '${pdk_oni_nvl4+(origem_oni_pdk_val+fdv_oni_nvl4+6)}$',
            '${pdk_oni_nvl5+(origem_oni_pdk_val+fdv_oni_nvl6+6)}$',
            '${pdk_oni_nvl6+(origem_oni_pdk_val+fdv_oni_nvl6+8)}$',
            '${pdk_oni_nvl7+(origem_oni_pdk_val+fdv_oni_nvl8+8)}$',
            '${pdk_oni_nvl8+(origem_oni_pdk_val+fdv_oni_nvl8+10)}$',
            '${pdk_oni_nvl9+(origem_oni_pdk_val+fdv_oni_nvl8+10)}$',
            '${pdk_oni_nvl10+(origem_oni_pdk_val+fdv_oni_nvl11+10)}$',
            '${pdk_oni_nvl11+(origem_oni_pdk_val+fdv_oni_nvl12+12)}$',
            '${pdk_oni_nvl12+(origem_oni_pdk_val+fdv_oni_nvl13+12)}$',
            '${pdk_oni_nvl13+(origem_oni_pdk_val+fdv_oni_nvl13+14)}$',
            '${pdk_oni_nvl14+(origem_oni_pdk_val+fdv_oni_nvl13+14)}$',
            '${pdk_oni_nvl15+(origem_oni_pdk_val+fdv_oni_nvl16+16)}$',
            '${pdk_oni_nvl16+(origem_oni_pdk_val+fdv_oni_nvl16+16)}$',
            '${pdk_oni_nvl17+(origem_oni_pdk_val+fdv_oni_nvl16+18)}$',
            '${pdk_oni_nvl18+(origem_oni_pdk_val+fdv_oni_nvl16+20)}$',
            '${pdk_oni_nvl19+(origem_oni_pdk_val+fdv_oni_nvl16+50)}$',
        ];
        for (let level = 1; level <= 20; level += 1) {
            assert.equal(byKey.get(`pdv_oni_nvl${level}`)?.value, pdv[level - 1]);
            assert.equal(byKey.get(`pdk_oni_nvl${level}`)?.value, pdk[level - 1]);
        }
    });

    it('não expõe painéis internos de progressão nem componentes Slayer', () => {
        const serialized = JSON.stringify(source.system?.body);
        for (const forbidden of [
            'progressao_oni_recursos_panel',
            'origem_oni_recursos_panel',
            'armas_proficientes',
            'acoes_slayer_panel',
        ])
            assert.doesNotMatch(serialized, new RegExp(forbidden));
        assert.match(serialized, /acoes_oni_panel/);
    });

    it('botões executam ações sem devolver objetos para o avaliador do CSB', () => {
        const messages = [];
        const walk = (value) => {
            if (Array.isArray(value)) return value.forEach(walk);
            if (!value || typeof value !== 'object') return;
            if (typeof value.rollMessage === 'string' && value.rollMessage)
                messages.push(value.rollMessage);
            Object.values(value).forEach(walk);
        };
        walk(source.system);
        assert.ok(messages.length > 0);
        for (const message of messages) {
            assert.doesNotMatch(message, /return await/);
            assert.match(message, /return '';}%$/);
        }
    });

    it('não expõe RESETAR FICHA nem chama resetSheet', () => {
        const serialized = JSON.stringify(source.system);
        assert.doesNotMatch(serialized, /na_oni_reset_ficha|RESETAR FICHA|resetSheet/);
    });

    it('não expõe o botão de snapshot Atributos na ficha Oni', () => {
        const serialized = JSON.stringify(source.system?.body);
        assert.doesNotMatch(serialized, /NAAttrLevel00001|>Atributos<\/span>/);
    });

    it('mantém as keys de dano e converte o recurso demoníaco para PDK', () => {
        const migrated = migrateOniTemplate(source);
        const serialized = JSON.stringify(migrated);
        for (const key of ['pdv_oni_dano_ferida', 'pdk_oni_total_conta']) {
            assert.match(serialized, new RegExp(key));
        }
        assert.doesNotMatch(serialized, /pdr_oni/);
        assert.equal(migrated.name, 'oni_template');
        assert.equal(migrated.type, '_template');
    });

    it('usa recursos numéricos nas barras e progressão Oni de 0 a 20', () => {
        const migrated = migrateOniTemplate(source);
        assert.deepEqual(migrated.system.attributeBar, {
            pdv_oni_barra: {
                value: '${pdv_oni_atual_num}$',
                max: '${pdv_oni_total_conta}$',
                editable: false,
            },
            pdk_oni_barra: {
                value: '${pdk_oni_atual_num}$',
                max: '${pdk_oni_total_conta}$',
                editable: false,
            },
        });
        const serialized = JSON.stringify(migrated);
        for (const key of [
            'pdv_oni_total_conta',
            'pdk_oni_total_conta',
            'pdv_oni_ganho_nvl2',
            'pdv_oni_ganho_nvl12',
        ])
            assert.match(serialized, new RegExp(key));
        assert.match(serialized, /"key":"nvl_20","value":"20"/);
        const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
        const pdvTotal = hidden.get('pdv_oni_total_conta');
        assert.match(pdvTotal, /switchCase/);
        assert.match(pdvTotal, /pdv_oni_nvl1/);
        const pdkTotal = hidden.get('pdk_oni_total_conta');
        assert.match(pdkTotal, /switchCase/);
        assert.match(pdkTotal, /pdk_oni_nvl1/);
    });

    it('calcula os sete atributos somando bonus de origem Oni, sem depender de bonus exclusivos do Slayer', () => {
        const migrated = migrateOniTemplate(source);
        const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
        for (const attr of ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab']) {
            const formula = hidden.get(`${attr}_display`);
            assert.ok(formula, `${attr}_display deve existir`);
            assert.match(
                formula,
                new RegExp(`atr_${attr}_.*valor.*config\\+bonus_atr_${attr}_.*valor.*temp`)
            );
            assert.doesNotMatch(formula, /tsuyoi|marca|resp/);
        }
    });

    it('pdk_oni_atual_num nao referencia metal_oni_pdr_bonus', () => {
        const migrated = migrateOniTemplate(source);
        const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
        const formula = hidden.get('pdk_oni_atual_num');
        assert.ok(formula, 'pdk_oni_atual_num deve existir');
        assert.doesNotMatch(formula, /metal_oni_pdr_bonus/);
    });

    it('nao possui hidden attributes de Origens Slayer (origem_oni_pdr_val)', () => {
        const migrated = migrateOniTemplate(source);
        const names = migrated.system.hidden.map((h) => h.name);
        assert.ok(
            !names.includes('origem_oni_pdr_val'),
            'origem_oni_pdr_val deve ter sido removido'
        );
        assert.ok(
            !names.includes('origem_pdv_fixo'),
            'origem_pdv_fixo nao deve existir no template Oni'
        );
        assert.ok(
            !names.includes('origem_pdk_fixo'),
            'origem_pdk_fixo nao deve existir no template Oni'
        );
        assert.ok(
            names.includes('origem_oni_pdv_val'),
            'origem_oni_pdv_val deve existir no template oficial'
        );
        assert.ok(
            names.includes('origem_oni_pdk_val'),
            'origem_oni_pdk_val deve existir no template oficial'
        );
    });

    it('usa camadas de origem (fixo) com valores oficiais auditados', () => {
        const migrated = migrateOniTemplate(source);
        const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
        for (const name of ['origem_oni_pdv_val', 'origem_oni_pdk_val']) {
            assert.ok(hidden.get(name), `${name} deve existir`);
        }
        const pdvVal = hidden.get('origem_oni_pdv_val');
        assert.match(pdvVal, /switchCase/);
        assert.match(pdvVal, /'origem_oni_transfigurado',\s*\n\s*24,/);
        assert.match(pdvVal, /'origem_oni_chama_negra',\s*\n\s*20,/);
        assert.match(pdvVal, /'origem_oni_corte_palida',\s*\n\s*18,/);
        assert.match(pdvVal, /'origem_oni_exterminador_corrompido',.*30\+\(vit_oni_nvl1\*3\)/s);
        const pdkVal = hidden.get('origem_oni_pdk_val');
        assert.match(pdkVal, /switchCase/);
        assert.match(pdkVal, /'origem_oni_tela_do_submundo',\s*\n\s*20,/);
        assert.match(pdkVal, /'origem_oni_mare_negra',\s*\n\s*17,/);
        assert.match(pdkVal, /'origem_oni_raiz_podre',\s*\n\s*16,/);
        assert.match(pdkVal, /'origem_oni_adepto_das_trevas',\s*\n\s*4,/);
    });

    it('remove placeholders vazios e preserva somente fórmulas CSB válidas', () => {
        const migrated = migrateOniTemplate(source);
        for (const entry of migrated.system.hidden) {
            assert.notEqual(
                entry.value,
                '$',
                `${entry.name} não pode usar o placeholder inválido '$'`
            );
            assert.notEqual(entry.value, '', `${entry.name} não pode ter fórmula vazia`);
        }
    });

    it('isola componentes, recursos e ações no namespace Oni', () => {
        const migrated = migrateOniTemplate(source);
        const serialized = JSON.stringify(migrated);
        assert.doesNotMatch(
            serialized,
            /pdv_slayer|pdr_slayer|status_slayer|resistencia_slayer|combat_slayer|folego_slayer/
        );
        assert.match(serialized, /kind:'oni'/);
    });

    it('normaliza todas as keys de atributos Oni para o contrato canônico', () => {
        const migrated = migrateOniTemplate(source);
        const serialized = JSON.stringify(migrated);
        for (const attr of ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab']) {
            assert.match(serialized, new RegExp(`atr_${attr}_.*valor.*config`));
            assert.match(serialized, new RegExp(`bonus_atr_${attr}_.*valor.*temp`));
            assert.doesNotMatch(serialized, new RegExp(`atr_${attr}_valor_config`));
        }
    });

    it('não duplica keys nem produz linhas de tabela inválidas para o CSB', () => {
        const migrated = migrateOniTemplate(source);
        const componentKeys = [];
        const invalidRows = [];
        const walk = (value) => {
            if (Array.isArray(value)) return value.forEach(walk);
            if (!value || typeof value !== 'object') return;
            if (typeof value.key === 'string' && value.key) componentKeys.push(value.key);
            if (value.type === 'table') {
                assert.ok(Array.isArray(value.contents), `${value.key}: contents deve ser array`);
                value.contents.forEach((row, index) => {
                    if (!Array.isArray(row)) invalidRows.push(`${value.key}[${index}]`);
                });
            }
            Object.values(value).forEach(walk);
        };
        walk(migrated.system.body);

        const duplicateComponents = [
            ...new Set(componentKeys.filter((key, index) => componentKeys.indexOf(key) !== index)),
        ];
        const hiddenNames = migrated.system.hidden.map((entry) => entry.name);
        const duplicateHidden = [
            ...new Set(hiddenNames.filter((name, index) => hiddenNames.indexOf(name) !== index)),
        ];
        assert.deepEqual(
            duplicateComponents,
            [],
            `keys de componentes duplicadas: ${duplicateComponents.join(', ')}`
        );
        assert.deepEqual(duplicateHidden, [], `hidden duplicados: ${duplicateHidden.join(', ')}`);
        assert.deepEqual(invalidRows, [], `linhas de tabela inválidas: ${invalidRows.join(', ')}`);
    });

    it('display fields usam valores numéricos puros, não totais', () => {
        const walk = (value) => {
            const results = [];
            if (Array.isArray(value)) {
                for (const item of value) results.push(...walk(item));
                return results;
            }
            if (!value || typeof value !== 'object') return results;
            if (
                value.key === 'pdv_oni_atual_valor_display' ||
                value.key === 'pdk_oni_atual_valor_display'
            ) {
                results.push({ key: value.key, value: value.value });
            }
            for (const v of Object.values(value)) results.push(...walk(v));
            return results;
        };
        const displays = walk(source.system?.body);
        assert.equal(displays.length, 2, 'deve haver exatamente 2 display fields (PDV + PDK)');
        for (const { key, value } of displays) {
            assert.match(value, /\$\{(pdv|pdk)_oni_atual_num\}/, `${key} deve usar *_atual_num`);
            assert.doesNotMatch(value, /total_conta/, `${key} não pode usar *_total_conta`);
            assert.doesNotMatch(
                value,
                /custom-orbitron-wrapper/,
                `${key} não pode ter wrapper HTML`
            );
        }
    });

    it('hidden numéricos não contêm HTML', () => {
        const migrated = migrateOniTemplate(source);
        for (const entry of migrated.system.hidden) {
            if (entry.name.includes('_num') || entry.name.includes('_conta')) {
                assert.doesNotMatch(entry.value, /<div/, `${entry.name} não pode conter <div>`);
                assert.doesNotMatch(entry.value, /<span/, `${entry.name} não pode conter <span>`);
                assert.doesNotMatch(
                    entry.value,
                    /custom-orbitron-wrapper/,
                    `${entry.name} não pode ter wrapper`
                );
            }
        }
    });
});
