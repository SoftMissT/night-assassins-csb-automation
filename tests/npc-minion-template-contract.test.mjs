import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

async function template(name) {
    return JSON.parse(
        await readFile(new URL(`../src/templates/actors/${name}`, import.meta.url), 'utf8')
    );
}

function components(node, found = []) {
    if (!node || typeof node !== 'object') return found;
    if (typeof node.key === 'string' && node.key) found.push(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((entry) => components(entry, found));
        else if (value && typeof value === 'object') components(value, found);
    }
    return found;
}

describe('contrato oficial NPC e Oni Minion', () => {
    it('preserva os cálculos oficiais de vida e recurso', async () => {
        const npc = await template('npc-template.json');
        const minion = await template('oni-minion-template.json');
        const npcHidden = new Map(npc.system.hidden.map(({ name, value }) => [name, value]));
        const minionHidden = new Map(minion.system.hidden.map(({ name, value }) => [name, value]));

        assert.equal(
            npcHidden.get('npc_pdv_atual'),
            '${(npc_pdv_base+npc_pdv_curado)-npc_pdv_dano}$'
        );
        assert.equal(
            npcHidden.get('npc_pdr_atual'),
            '${(npc_pdr_base+npc_pdr_recuperado)-npc_pdr_gasto_valor}$'
        );
        assert.equal(
            minionHidden.get('oni_minion_pdv_atual'),
            '${(oni_minion_pdv_base+oni_minion_pdv_curado)-oni_minion_pdv_dano}$'
        );
        assert.equal(
            minionHidden.get('oni_minion_pdk_atual'),
            '${(oni_minion_pdk_base+oni_minion_pdk_recuperado)-oni_minion_pdk_gasto}$'
        );
    });

    it('associa cada key do Oni Minion à chamada correta', async () => {
        const minion = await template('oni-minion-template.json');
        const byKey = new Map(components(minion.system.body).map((entry) => [entry.key, entry]));

        assert.match(byKey.get('oni_minion_roll_acerto').rollMessage, /NAHitRoll0000001/);
        assert.match(byKey.get('oni_minion_roll_bloqueio').rollMessage, /test:'Bloqueio'/);
        assert.match(byKey.get('oni_minion_roll_esquiva').rollMessage, /test:'Esquiva'/);
        assert.match(byKey.get('oni_minion_roll_dano').rollMessage, /NADamageRoll0001/);
    });

    it('associa cada key do NPC à chamada correta', async () => {
        const npc = await template('npc-template.json');
        const byKey = new Map(components(npc.system.body).map((entry) => [entry.key, entry]));

        assert.match(byKey.get('npc_roll_acerto').rollMessage, /NAHitRoll0000001/);
        assert.match(byKey.get('npc_roll_bloqueio').rollMessage, /test:'Bloqueio'/);
        assert.match(byKey.get('npc_roll_esquiva').rollMessage, /test:'Esquiva'/);
        assert.match(byKey.get('npc_roll_dano').rollMessage, /NADamageRoll0001/);
    });
});
