import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();
// Validador simples no lugar do Roll.validate do core: dados, números, @atributos já resolvidos.
globalThis.Roll.validate = (formula) => /^[\d\sdkhl+\-*/()]+$/iu.test(String(formula));

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    applyChosenDamageToPatch,
    CHOSEN_DAMAGE_BREATHINGS,
    replaceBaseFormula,
    replaceFormDamage,
    resolveChosenDamage,
} from '../scripts/breath-damage-choice.mjs';
import { buildFlameBreathingPlan } from '../scripts/flame-breathing-service.mjs';
import { flameFormById } from '../scripts/flame-breathing-data.mjs';
import { buildSnowBreathingPlan } from '../scripts/snow-breathing-service.mjs';
import { snowFormById } from '../scripts/snow-breathing-data.mjs';
import { buildWindBreathingPlan } from '../scripts/wind-breathing-service.mjs';
import { windFormById } from '../scripts/wind-breathing-data.mjs';

const stateOf = (patch, key) => JSON.parse(patch[`system.props.${key}`]);

describe('dano escolhido: troca do dado base', () => {
    it('só as 5 Respirações pedidas', () => {
        assert.deepEqual([...CHOSEN_DAMAGE_BREATHINGS].sort(), ['Chamas', 'Metal', 'Neve', 'Pedra', 'Vento']);
    });

    it('fórmula que era só o base vira a escolha; dentro de soma entra entre parênteses', () => {
        assert.equal(replaceBaseFormula('4d10', '4d10', '3d12 + @for'), '3d12 + @for');
        assert.equal(replaceBaseFormula('1d6 + 1d6 + 1d6', '1d6', '1d8'), '(1d8) + (1d8) + (1d8)');
    });

    it('não casa dentro de outro número', () => {
        assert.equal(replaceBaseFormula('12d4 + 2d40', '2d4', '9d9'), '12d4 + 2d40');
    });

    it('só mexe no que pertence à Forma usada', () => {
        const state = {
            pendingDamage: { source: 'chamas_05', formula: '4d10' },
            pendingEffects: [
                { source: 'chamas_02', formula: '4d10' },
                { source: 'chamas_05', formulas: ['4d10', '1d6'] },
            ],
        };
        const next = replaceFormDamage(state, 'chamas_05', '4d10', '5d8');
        assert.equal(next.pendingDamage.formula, '5d8');
        assert.equal(next.pendingEffects[0].formula, '4d10', 'outra Forma fica como está');
        assert.deepEqual(next.pendingEffects[1].formulas, ['5d8', '1d6']);
    });
});

describe('dano escolhido: planos reais', () => {
    it('Chamas 5ª Forma: o dano da fila passa a ser o escolhido', () => {
        const plan = buildFlameBreathingPlan('chamas_05', 1, {});
        assert.ok(plan.ok);
        const base = flameFormById('chamas_05').levels[0].damage;
        const changed = applyChosenDamageToPatch(plan.patch, { formId: 'chamas_05', base, chosen: '3d12 + @for' });
        const state = stateOf({ ...plan.patch, ...changed }, 'resp_chamas_estado');
        assert.equal(state.pendingDamage.formula, '3d12 + @for');
    });

    it('Chamas 1ª Forma: dano principal e efeito pendente da Forma trocam juntos', () => {
        const plan = buildFlameBreathingPlan('chamas_02', 1, {});
        assert.ok(plan.ok);
        const base = flameFormById('chamas_02').levels[0].damage;
        const changed = applyChosenDamageToPatch(plan.patch, { formId: 'chamas_02', base, chosen: '1d10' });
        const state = stateOf({ ...plan.patch, ...changed }, 'resp_chamas_estado');
        assert.equal(state.pendingDamage.formula, '1d10');
        assert.equal(state.pendingDamage.formulas[0], '1d10');
        const rider = (state.pendingEffects ?? []).find((entry) => entry.kind === 'rider_damage');
        if (rider) assert.equal(rider.formula, '1d10');
    });

    it('Neve 1ª Forma no nível 3: troca o dano e mantém o resto do estado', () => {
        const plan = buildSnowBreathingPlan('neve_01', 3, {});
        assert.ok(plan.ok);
        const base = snowFormById('neve_01').levels[2].damage;
        assert.equal(base, '2d8');
        const changed = applyChosenDamageToPatch(plan.patch, { formId: 'neve_01', base, chosen: '2d12' });
        const state = stateOf({ ...plan.patch, ...changed }, 'resp_neve_estado');
        assert.equal(state.pendingDamage.formula, '2d12');
        assert.equal(state.pendingDamage.freezeOnHit, 1, 'efeito da Forma continua');
        assert.equal(state.nextHit.source, 'neve_01');
    });

    it('Vento Tufão Idaten: o escolhido troca o damageBase e mantém cicatrizes e DEX', () => {
        const props = { dex_display: 5, for_display: 3, resp_vento_estado: JSON.stringify({ scars: 3 }) };
        const plan = buildWindBreathingPlan('vento_10', 4, props, {});
        assert.ok(plan.ok);
        const base = windFormById('vento_10').levels[3].damageBase;
        assert.equal(base, '10d10');
        const changed = applyChosenDamageToPatch(plan.patch, { formId: 'vento_10', base, chosen: '12d10' });
        const state = stateOf({ ...plan.patch, ...changed }, 'resp_vento_estado');
        assert.equal(state.pendingDamage.formula, '(12d10) + 3 * (2d10) + 5 * (2d10)');
    });

    it('sem troca (escolha igual à tabela) o patch não muda', () => {
        const plan = buildFlameBreathingPlan('chamas_05', 1, {});
        const base = flameFormById('chamas_05').levels[0].damage;
        assert.deepEqual(applyChosenDamageToPatch(plan.patch, { formId: 'chamas_05', base, chosen: base }), {});
    });
});

describe('dano escolhido: validação e guarda', () => {
    it('vazio volta ao guardado; atributo é resolvido antes de validar', () => {
        assert.deepEqual(resolveChosenDamage('', '4d10'), { ok: true, formula: '4d10' });
        assert.deepEqual(resolveChosenDamage(' 2d6 + @for ', '4d10', { for: 3 }), { ok: true, formula: '2d6 + @for' });
    });

    it('fórmula inválida é recusada com o motivo', () => {
        const result = resolveChosenDamage('dois dados', '4d10');
        assert.equal(result.ok, false);
        assert.match(result.reason, /Dano inválido/u);
    });

    it('o serviço valida antes de gastar e grava no nível usado do Item', async () => {
        const source = await readFile(new URL('../scripts/breath-service.mjs', import.meta.url), 'utf8');
        const choiceAt = source.indexOf('resolveChosenDamage(dialogResult.damage');
        assert.ok(choiceAt > 0);
        const canonicalAt = source.indexOf("if (isMigrated(form.respiracao) && !form.id.startsWith('custom_'))");
        assert.ok(canonicalAt > choiceAt, 'antes da separação entre o fluxo canônico e o personalizado');
        assert.match(source, /item\.update\(\{ \[`system\.props\.nvl\$\{selected\.level\}_dano`\]: chosen\.formula \}\)/u);
        assert.match(source, /damageOverride: damageChoice\?\.chosen/u);
    });

    it('texto descritivo do catálogo deixado como veio não bloqueia a Forma', async () => {
        // vento_10 guarda "10d10 + 2d10 por cicatriz…" em nvlN_dano: não é fórmula, e antes
        // o diálogo pré-preenchido recusava "Dano inválido" e a Forma nem lançava.
        assert.equal(resolveChosenDamage('10d10 + 2d10 por cicatriz', '').ok, false);
        const source = await readFile(new URL('../scripts/breath-service.mjs', import.meta.url), 'utf8');
        assert.match(source, /const untouchedText = typed === String\(selected\.dano \?\? ''\)\.trim\(\) &&/u);
        assert.match(source, /tableLevel\?\.damage \?\? tableLevel\?\.damageBase \?\? selected\.dano/u);
    });
});
