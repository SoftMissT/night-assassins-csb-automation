import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    planOniRepair,
    repairOniActors,
    ONI_REPAIR_VERSION,
} from '../scripts/oni/repair-service.mjs';

function legacyOniActor(overrides = {}) {
    const props = {
        nome_oni: 'Kaigaku Teste',
        pdv_oni_total_conta: 90,
        nvl_pj: 'nvl_9',
        origem_dropdown: 'origem_oni_corte_palida',
        classe_escolhida: 'classe_oni_espadachim_profano',
        // Dano parcial já sofrido — repair NUNCA pode curar isso.
        pdv_oni_dano_tomado: 35,
        pdv_oni_atual_num: 55,
        pdv_oni_maximo_num: 90,
        pdk_oni_atual_num: 12,
        pdk_oni_maximo_num: 30,
        // Fôlego legado (deve simplesmente ficar órfão — Oni não usa mais).
        folego_oni_atual: 2,
        ...overrides,
    };
    const flags = {};
    return {
        name: 'Kaigaku Teste',
        img: 'actor.webp',
        system: { template: 'oni_template', props },
        items: [
            { name: 'Kusarigama', type: 'item' },
            { name: 'Sangue das Sombras', type: 'item' },
        ],
        getFlag: (mod, key) => flags[`${mod}.${key}`],
        setFlag: async (mod, key, value) => {
            flags[`${mod}.${key}`] = value;
        },
        update: async function (patch) {
            for (const [k, v] of Object.entries(patch)) {
                const propKey = k.replace(/^system\.props\./, '');
                if (propKey !== k) props[propKey] = v;
            }
            this.patches = [...(this.patches ?? []), patch];
        },
    };
}

describe('repairOniActors — migração de Actor Oni legado', () => {
    it('planOniRepair migra Classe legada para Especialização sem apagar o dado antigo', () => {
        const actor = legacyOniActor();
        const { needsRepair, patch, preserved } = planOniRepair(actor);
        assert.equal(needsRepair, true);
        assert.equal(
            patch['system.props.oni_especializacao_id'],
            'oni_especializacao_espadachim_profano'
        );
        assert.equal(
            actor.system.props.classe_escolhida,
            'classe_oni_espadachim_profano',
            'valor legado não é apagado'
        );
        assert.equal(preserved.pdvAtual, 55);
        assert.equal(preserved.pdkAtual, 12);
        assert.equal(preserved.nivel, 'nvl_9');
        assert.equal(preserved.origem, 'origem_oni_corte_palida');
    });

    it('repairOniActors preserva nome, imagem, Items, PDV/PDK atual e não cura o Actor', async () => {
        const actor = legacyOniActor();
        const result = await repairOniActors(actor);
        assert.equal(result.repaired, true);
        assert.equal(actor.name, 'Kaigaku Teste');
        assert.equal(actor.img, 'actor.webp');
        assert.equal(actor.items.length, 2);
        assert.equal(
            actor.system.props.pdv_oni_dano_tomado,
            35,
            'dano tomado preservado — não cura ao migrar'
        );
        assert.equal(
            actor.system.props.oni_especializacao_id,
            'oni_especializacao_espadachim_profano'
        );
        assert.equal(
            actor.getFlag('night-assassins-csb-automation', 'oniRepairVersion'),
            ONI_REPAIR_VERSION
        );
    });

    it('é idempotente — segunda chamada não gera novo patch', async () => {
        const actor = legacyOniActor();
        await repairOniActors(actor);
        const patchesAfterFirst = actor.patches.length;
        const second = await repairOniActors(actor);
        assert.equal(second.skipped, true);
        assert.equal(
            actor.patches.length,
            patchesAfterFirst,
            'nenhum patch adicional na segunda chamada'
        );
    });

    it('Actor já na Especialização nova não é reescrito', async () => {
        const actor = legacyOniActor({ oni_especializacao_id: 'oni_especializacao_titan' });
        const { needsRepair } = planOniRepair(actor);
        assert.equal(needsRepair, false);
    });

    it('Actor Slayer é ignorado (repair só atua sobre Oni)', async () => {
        const slayer = {
            name: 'Slayer',
            system: { template: 'slayer_template', props: { nome_slayer: 'X' } },
            update: async () => {},
            getFlag: () => undefined,
            setFlag: async () => {},
        };
        const result = await repairOniActors(slayer);
        assert.equal(result.skipped, true);
        assert.equal(result.repaired, false);
    });
});
