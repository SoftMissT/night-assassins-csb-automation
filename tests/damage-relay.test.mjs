import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    applyOniDamage,
    applySlayerDamageAuto,
    calculateApprovedDamage,
    DAMAGE_RELAY_KEY,
    DAMAGE_TYPES,
    requestDamageApproval,
    WOUND_DAMAGE_KEY,
} from '../scripts/damage-relay.mjs';

describe('damage-relay', () => {
    it('acumula somente pdv_oni_dano_tomado quando o usuário pode atualizar', async () => {
        game.user.isGM = false;
        const actor = {
            name: 'Oni',
            uuid: 'Actor.oni',
            isOwner: true,
            system: { props: { pdv_oni_dano_tomado: 7 } },
            update: async (patch, options) => {
                assert.deepStrictEqual(patch, { 'system.props.pdv_oni_dano_tomado': 12 });
                assert.strictEqual(options.naCsbAutomation, true);
            },
        };

        const result = await applyOniDamage(actor, 5);
        assert.strictEqual(DAMAGE_RELAY_KEY, 'pdv_oni_dano_tomado');
        assert.strictEqual(result.total, 12);
    });

    it('rejeita dano zero ou negativo', async () => {
        await assert.rejects(() => applyOniDamage({ isOwner: true }, 0), /dano inválido/i);
    });

    it('separa Ferida do dano comum e acumula a perda de PDV máximo', async () => {
        game.user.isGM = false;
        const actor = {
            name: 'Oni',
            uuid: 'Actor.oni',
            isOwner: true,
            system: { props: { pdv_oni_dano_tomado: 7, pdv_oni_dano_ferida: 2 } },
            update: async (patch) =>
                assert.deepStrictEqual(patch, {
                    'system.props.pdv_oni_dano_tomado': 12,
                    'system.props.pdv_oni_dano_ferida': 6,
                }),
        };

        const result = await applyOniDamage(actor, 9, {
            damageTypes: ['cortante', 'ferida'],
            components: [
                { label: 'Corte', types: ['cortante'], subtotal: 5 },
                { label: 'Marca', types: ['ferida'], subtotal: 4 },
            ],
        });
        assert.strictEqual(WOUND_DAMAGE_KEY, 'pdv_oni_dano_ferida');
        assert.strictEqual(result.normalDamage, 5);
        assert.strictEqual(result.woundDamage, 4);
        assert.strictEqual(result.total, 12);
        assert.strictEqual(result.woundTotal, 6);
    });

    it('mostra ao GM crítico, resistência e todos os tipos de dano', async () => {
        let dialogConfig;
        foundry.applications = {
            api: {
                DialogV2: {
                    wait: async (config) => {
                        dialogConfig = config;
                        return true;
                    },
                },
            },
        };

        const approved = await requestDamageApproval(
            { name: 'Oni Lua' },
            { name: 'Tanjiro' },
            24,
            8,
            {
                attackName: 'Hinokami',
                critical: true,
                rolledTotal: 24,
                damageTypes: ['fogo', 'cortante'],
                components: [
                    { label: 'Lâmina', types: ['cortante'], subtotal: 14 },
                    { label: 'Chama', types: ['fogo'], subtotal: 10 },
                ],
            }
        );
        assert.strictEqual(approved, true);
        assert.match(dialogConfig.content, /Tanjiro/);
        assert.match(dialogConfig.content, /Oni Lua/);
        assert.match(dialogConfig.content, /Hinokami/);
        assert.match(dialogConfig.content, /Crítico · base 24/);
        assert.match(dialogConfig.content, /Lâmina/);
        assert.match(dialogConfig.content, /Chama/);
        assert.match(dialogConfig.content, /Resistente · metade/);
        assert.strictEqual(
            (dialogConfig.content.match(/name="damageType"/g) ?? []).length,
            DAMAGE_TYPES.length
        );
        assert.deepStrictEqual(
            dialogConfig.buttons.map(({ action }) => action),
            ['deny', 'approve']
        );
    });

    it('aplica resistência depois do dano crítico já calculado', () => {
        assert.strictEqual(calculateApprovedDamage(42, false), 42);
        assert.strictEqual(calculateApprovedDamage(42, true), 21);
        assert.strictEqual(calculateApprovedDamage(41, true), 20);
    });

    it('bloqueia a resistência no modal quando a técnica a ignora', async () => {
        let dialogConfig;
        foundry.applications = {
            api: {
                DialogV2: {
                    wait: async (config) => {
                        dialogConfig = config;
                        return true;
                    },
                },
            },
        };
        await requestDamageApproval({ name: 'Oni Lua' }, { name: 'Caçador' }, 12, 0, {
            attackName: 'Martelo do Julgamento',
            damageTypes: ['concussao'],
            ignoreResistance: true,
        });
        assert.match(dialogConfig.content, /Ignorada pela técnica/);
        assert.doesNotMatch(dialogConfig.content, /name="damageResistance"/);
    });

    it('aplica automaticamente dano e Ferida no Slayer quando há ownership', async () => {
        game.user.isGM = false;
        const patches = [];
        const actor = {
            id: 'slayer',
            name: 'Slayer',
            uuid: 'Actor.slayer',
            isOwner: true,
            system: { props: { pdv_slayer_dano_tomado: 2, pdv_slayer_dano_ferida: 1 } },
            update: async (patch) => patches.push(patch),
        };
        const result = await applySlayerDamageAuto(actor, 7, {
            components: [
                { label: 'Corte', types: ['cortante'], subtotal: 5 },
                { label: 'Marca', types: ['ferida'], subtotal: 2 },
            ],
        });
        assert.equal(result.normalDamage, 5);
        assert.equal(result.woundDamage, 2);
        assert.equal(patches[0]['system.props.pdv_slayer_dano_tomado'], 7);
        assert.equal(patches[0]['system.props.pdv_slayer_dano_ferida'], 3);
    });

    it('aplica Brasas no Oni pelo mesmo caminho autorizado do dano', async () => {
        game.user.isGM = true;
        const patches = [];
        let flameFlag = { slayer: { heat: 4, thresholds: [] } };
        const actor = {
            id: 'oni',
            name: 'Oni',
            uuid: 'Actor.oni-flame',
            documentName: 'Actor',
            isOwner: false,
            system: {
                props: { pdv_oni_dano_tomado: 0, status_oni_dados: '', status_oni_exaustao: 0 },
            },
            getFlag: () => flameFlag,
            setFlag: async (_module, _key, value) => {
                flameFlag = value;
            },
            update: async (patch) => patches.push(patch),
        };
        const result = await applyOniDamage(actor, 7, {
            damageTypes: ['fogo'],
            flame: { sourceId: 'slayer', heat: 1 },
        });
        assert.equal(result.appliedDamage, 7);
        assert.equal(result.flame.heat, 5);
        assert.deepEqual(result.flame.thresholds, [5]);
        assert.equal(flameFlag.slayer.heat, 5);
        assert.equal(patches[0]['system.props.pdv_oni_dano_tomado'], 7);
        assert.equal(patches[1]['system.props.status_oni_exaustao'], 1);
    });
});
