import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    SHEET_BONUS_KEYS,
    openDerivedBonusAudit,
    resolveSlayerDerivedBonuses,
    sheetBonusValue,
} from '../scripts/derived-bonus-service.mjs';

const TEMPLATES = {
    slayer: 'slayer-template.json',
    oni: 'oni-template.json',
    'oni-minion': 'oni-minion-template.json',
    npc: 'npc-template.json',
};

async function templateKeys(file) {
    const source = JSON.parse(
        await readFile(new URL(`../src/templates/actors/${file}`, import.meta.url), 'utf8')
    );
    const keys = new Set();
    const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        if (typeof node.key === 'string' && node.key) keys.add(node.key);
        Object.values(node).forEach(walk);
    };
    walk(source.system.body);
    return keys;
}

describe('Bônus Fixos da ficha', () => {
    it('lê a key do template e soma 0 em ficha sem a key', () => {
        assert.equal(sheetBonusValue({ bonus_acerto_slayer: '3' }, 'acerto'), 3);
        assert.equal(sheetBonusValue({ npc_bonus_dano: 2 }, 'dano'), 2);
        assert.equal(sheetBonusValue({ bonus_teste_oni: -1 }, 'teste'), -1);
        assert.equal(sheetBonusValue({}, 'acerto'), 0);
        assert.equal(sheetBonusValue({ bonus_acerto_slayer: '' }, 'acerto'), 0);
    });

    it('entra no agregador como fonte rotulada, sem tocar nos outros canais', () => {
        const resolved = resolveSlayerDerivedBonuses({
            bonus_acerto_slayer: 2,
            bonus_bloqueio_slayer: 3,
            bonus_esquiva_slayer: 4,
            bonus_percepcao_visual_slayer: 5,
            bonus_percepcao_auditiva_slayer: 6,
            bonus_social_voz_slayer: 7,
            bonus_dano_slayer: 4,
            bonus_iniciativa_slayer: 8,
            bonus_pdr_maximo_slayer: 9,
            bonus_teste_slayer: 1,
        });
        assert.equal(resolved.channels.acerto.total, 2);
        assert.equal(resolved.channels.bloqueio.total, 3);
        assert.equal(resolved.channels.esquiva.total, 4);
        assert.equal(resolved.channels.percepcaoVisual.total, 5);
        assert.equal(resolved.channels.percepcaoAuditiva.total, 6);
        assert.equal(resolved.channels.socialVoz.total, 7);
        assert.equal(resolved.channels.danoFixo.total, 4);
        assert.equal(resolved.channels.iniciativa.total, 8);
        assert.equal(resolved.channels.pdrMaximo.total, 9);
        assert.equal(resolved.channels.teste.total, 1);
        assert.deepEqual(
            resolved.channels.acerto.sources.map((source) => [source.label, source.origin]),
            [['Bônus da ficha (acerto)', 'Ficha']]
        );
    });

    for (const [kind, file] of Object.entries(TEMPLATES)) {
        it(`a ficha ${kind} tem os três campos e cada um é uma key do agregador`, async () => {
            const keys = await templateKeys(file);
            const present = Object.values(SHEET_BONUS_KEYS).map((candidates) =>
                candidates.filter((key) => keys.has(key))
            );
            for (const found of present) assert.equal(found.length, 1, `${kind}: ${found}`);
        });
    }

    it('auditoria GM resolve Actor por UUID, mostra fontes e fecha sem disparar rolagem', async () => {
        const previous = {
            game: globalThis.game,
            foundry: globalThis.foundry,
            fromUuid: globalThis.fromUuid,
            ui: globalThis.ui,
        };
        let dialogConfig;
        const actor = {
            name: 'Auditoria',
            system: { props: { bonus_acerto_slayer: 4 } },
        };
        globalThis.game = { user: { isGM: true } };
        globalThis.fromUuid = async () => actor;
        globalThis.ui = { notifications: { warn: () => {} } };
        globalThis.foundry = {
            applications: {
                api: {
                    DialogV2: {
                        wait: async (config) => {
                            dialogConfig = config;
                            return config.buttons[0].callback();
                        },
                    },
                },
            },
        };
        await openDerivedBonusAudit({ actorUuid: 'Actor.audit' });
        assert.match(dialogConfig.content, /Bônus da ficha/);
        assert.equal(dialogConfig.buttons[0].callback(), false);
        globalThis.game.user.isGM = false;
        assert.equal(await openDerivedBonusAudit({ actor }), undefined);
        Object.assign(globalThis, previous);
    });
});
