import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { makeActor } from './fixtures/actor.mjs';

import {
    cutelosParryForActor,
    resolveCutelosParry,
    useCutelosParry,
} from '../scripts/weapon-reaction-service.mjs';

function cutelos(actor) {
    return {
        id: 'cutelos',
        name: 'Cutelos Gêmeos',
        parent: actor,
        system: {
            template: 'NAWeaponTpl00001',
            props: {
                arma_nome: 'Cutelos Gêmeos',
                arma_mecanicas: [
                    {
                        id: 'aparar_corrente',
                        kind: 'reaction-parry',
                        action: 'reacao',
                        physicalOnly: true,
                        targets: ['self', 'ally'],
                        hitDc: 16,
                        reduction: {
                            fixed: 4,
                            attributes: ['INT', 'SAB'],
                            multiplier: 0.5,
                            choice: true,
                        },
                    },
                ],
            },
        },
    };
}

describe('weapon-reaction-service', () => {
    it('descobre o Aparar apenas no Item Cutelos equipado pelo Actor', () => {
        const actor = makeActor();
        actor.items = [cutelos(actor)];
        const found = cutelosParryForActor(actor);
        assert.equal(found.item.id, 'cutelos');
        assert.equal(found.mechanic.hitDc, 16);
    });

    it('sucesso físico reduz 4 + metade de INT ou SAB escolhido, limitado ao dano recebido', () => {
        const result = resolveCutelosParry({
            mechanic: cutelos(null).system.props.arma_mecanicas[0],
            hitTotal: 16,
            incomingDamage: 11,
            physical: true,
            targetKind: 'self',
            reductionAttribute: 'INT',
            attributes: { int: 8, sab: 12 },
        });
        assert.deepEqual(result, {
            ok: true,
            passed: true,
            dc: 16,
            reductionAttribute: 'INT',
            reductionRolled: 8,
            reductionApplied: 8,
            remainingDamage: 3,
        });
    });

    it('não reduz dano não físico e falha abaixo da CD 16', () => {
        const mechanic = cutelos(null).system.props.arma_mecanicas[0];
        assert.deepEqual(
            resolveCutelosParry({
                mechanic,
                hitTotal: 20,
                incomingDamage: 10,
                physical: false,
                targetKind: 'self',
                reductionAttribute: 'SAB',
                attributes: { sab: 10 },
            }),
            { ok: false, reason: 'physical-only' }
        );
        assert.deepEqual(
            resolveCutelosParry({
                mechanic,
                hitTotal: 15,
                incomingDamage: 10,
                physical: true,
                targetKind: 'ally',
                reductionAttribute: 'SAB',
                attributes: { sab: 10 },
            }),
            {
                ok: true,
                passed: false,
                dc: 16,
                reductionAttribute: 'SAB',
                reductionRolled: 0,
                reductionApplied: 0,
                remainingDamage: 10,
            }
        );
    });

    it('consome exatamente uma Reação mesmo quando o aparar falha', async () => {
        const patches = [];
        const actor = makeActor({
            props: { nome_slayer: 'Slayer', int_display: 8, sab_display: 4 },
            update: async (patch) => patches.push(patch),
        });
        actor.items = [cutelos(actor)];
        const result = await useCutelosParry(actor, {
            hitTotal: 15,
            incomingDamage: 10,
            physical: true,
            targetKind: 'self',
            reductionAttribute: 'INT',
        });
        assert.equal(result.ok, true);
        assert.equal(result.passed, false);
        assert.equal(patches.length, 1);
        assert.equal(JSON.parse(patches[0]['system.props.acoes_slayer_dados']).round.reacao, 1);
    });

    it('aceita proteger aliado e rejeita enemy, other ou alvo ausente sem consumir Reação', async () => {
        const mechanic = cutelos(null).system.props.arma_mecanicas[0];
        const ally = resolveCutelosParry({
            mechanic,
            hitTotal: 16,
            incomingDamage: 10,
            physical: true,
            targetKind: 'ally',
            reductionAttribute: 'SAB',
            attributes: { sab: 6 },
        });
        assert.equal(ally.ok, true);
        assert.equal(ally.reductionApplied, 7);

        for (const targetKind of ['enemy', 'other', undefined]) {
            const patches = [];
            const actor = makeActor({
                props: { nome_slayer: 'Slayer', int_display: 8, sab_display: 4 },
                update: async (patch) => patches.push(patch),
            });
            actor.items = [cutelos(actor)];
            const result = await useCutelosParry(actor, {
                hitTotal: 20,
                incomingDamage: 10,
                physical: true,
                targetKind,
                reductionAttribute: 'INT',
            });
            assert.deepEqual(result, {
                ok: false,
                reason: 'invalid-parry-target',
                targetKind: targetKind ?? '',
                allowedTargets: ['self', 'ally'],
            });
            assert.equal(patches.length, 0);
        }
    });

    it('rejeita totais ausentes, infinitos, NaN, lixo e dano negativo antes de consumir Reação', async () => {
        const invalidCases = [
            { hitTotal: undefined, incomingDamage: 10, reason: 'invalid-hit-total' },
            { hitTotal: Number.NaN, incomingDamage: 10, reason: 'invalid-hit-total' },
            { hitTotal: Number.POSITIVE_INFINITY, incomingDamage: 10, reason: 'invalid-hit-total' },
            { hitTotal: 'lixo', incomingDamage: 10, reason: 'invalid-hit-total' },
            { hitTotal: 20, incomingDamage: undefined, reason: 'invalid-incoming-damage' },
            { hitTotal: 20, incomingDamage: Number.NaN, reason: 'invalid-incoming-damage' },
            { hitTotal: 20, incomingDamage: -1, reason: 'invalid-incoming-damage' },
            { hitTotal: 20, incomingDamage: 'ERROR', reason: 'invalid-incoming-damage' },
        ];
        for (const sample of invalidCases) {
            const patches = [];
            const actor = makeActor({
                props: { nome_slayer: 'Slayer', int_display: 8, sab_display: 4 },
                update: async (patch) => patches.push(patch),
            });
            actor.items = [cutelos(actor)];
            const result = await useCutelosParry(actor, {
                ...sample,
                physical: true,
                targetKind: 'self',
                reductionAttribute: 'INT',
            });
            assert.deepEqual(result, { ok: false, reason: sample.reason });
            assert.equal(patches.length, 0);
        }
    });

    it('usa o primeiro valor numérico válido da cadeia display, config e valor', async () => {
        const actor = makeActor({
            props: {
                nome_slayer: 'Slayer',
                int_display: { value: 99 },
                atr_int_valor_config: '10',
                atr_int_valor: '<span>12</span>',
                sab_display: 'ERROR',
                atr_sab_valor_config: 'lixo',
                atr_sab_valor: '<strong>6</strong>',
            },
        });
        actor.items = [cutelos(actor)];
        const intResult = await useCutelosParry(actor, {
            hitTotal: 16,
            incomingDamage: 20,
            physical: true,
            targetKind: 'self',
            reductionAttribute: 'INT',
        });
        assert.equal(intResult.reductionRolled, 9, '4 + metade de config 10');

        actor.system.props.acoes_slayer_dados = '';
        const sabResult = await useCutelosParry(actor, {
            hitTotal: 16,
            incomingDamage: 20,
            physical: true,
            targetKind: 'ally',
            reductionAttribute: 'SAB',
        });
        assert.equal(sabResult.reductionRolled, 7, '4 + metade do HTML numérico 6');
    });

    it('rejeita Actor não Slayer mesmo contendo os Cutelos, sem update', async () => {
        const patches = [];
        const actor = makeActor({
            props: { int_display: 8 },
            update: async (patch) => patches.push(patch),
        });
        actor.items = [cutelos(actor)];
        const result = await useCutelosParry(actor, {
            hitTotal: 16,
            incomingDamage: 10,
            physical: true,
            targetKind: 'self',
            reductionAttribute: 'INT',
        });
        assert.deepEqual(result, { ok: false, reason: 'not-slayer' });
        assert.equal(patches.length, 0);
    });

    it('rejeita arma ausente ou weaponId divergente', async () => {
        const actor = makeActor({ props: { nome_slayer: 'Slayer' } });
        actor.items = [];
        assert.deepEqual(
            await useCutelosParry(actor, {
                hitTotal: 16,
                incomingDamage: 10,
                physical: true,
                targetKind: 'self',
                reductionAttribute: 'INT',
            }),
            { ok: false, reason: 'missing-parry' }
        );
        actor.items = [cutelos(actor)];
        assert.deepEqual(
            await useCutelosParry(actor, {
                weaponId: 'outra-arma',
                hitTotal: 16,
                incomingDamage: 10,
                physical: true,
                targetKind: 'self',
                reductionAttribute: 'INT',
            }),
            { ok: false, reason: 'missing-parry' }
        );
    });

    it('expõe o consumidor na API pública sem criar uma UI paralela', async () => {
        const main = await readFile(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
        assert.match(main, /import\s*\{\s*useCutelosParry\s*\}\s*from '\.\/weapon-reaction-service\.mjs'/u);
        assert.match(main, /module\.api\s*=\s*\{[\s\S]*?\buseCutelosParry\s*,/u);
    });
});
