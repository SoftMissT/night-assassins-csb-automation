import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyCombatant,
    slayerPanelData,
    oniPanelData,
    minionPanelData,
    buildGmPanelData,
} from '../scripts/oni/gm-panel-data.mjs';
import {
    makeSlayerActor,
    makeOniActor,
    makeOniMinionActor,
    makeNpcActor,
} from './fixtures/actors.mjs';

describe('gm-panel-data - classificacao', () => {
    it('classifica Slayer como slayer', () => {
        assert.equal(classifyCombatant(makeSlayerActor()), 'slayer');
    });

    it('classifica Oni como oni', () => {
        assert.equal(classifyCombatant(makeOniActor()), 'oni');
    });

    it('classifica Oni Minion como oni_minion', () => {
        assert.equal(classifyCombatant(makeOniMinionActor()), 'oni_minion');
    });

    it('classifica NPC como npc', () => {
        assert.equal(classifyCombatant(makeNpcActor()), 'npc');
    });
});

describe('gm-panel-data - Slayer', () => {
    it('extrai PDV/PDR do Slayer', () => {
        const data = slayerPanelData(makeSlayerActor());
        assert.ok(data);
        assert.equal(data.kind, 'slayer');
        assert.equal(data.pdv.maximum, 24);
        assert.equal(data.pdr.maximum, 12);
        assert.equal(data.pdr.gasto, 3);
        assert.equal(data.level, 5);
    });

    it('retorna null para nao-Slayer', () => {
        assert.equal(slayerPanelData(makeOniActor()), null);
    });
});

describe('gm-panel-data - Oni', () => {
    it('extrai PDV/PDK e bloqueadores do Oni', () => {
        const data = oniPanelData(makeOniActor());
        assert.ok(data);
        assert.equal(data.kind, 'oni');
        assert.equal(data.pdv.maximum, 40);
        assert.equal(data.pdk.maximum, 8);
        assert.equal(data.pdk.gasto, 2);
        assert.equal(data.level, 5);
        assert.equal(data.regenAvailable, true);
        assert.equal(data.regenerationBlocked, false);
    });

    it('detecta bloqueadores de regeneracao', () => {
        const oni = makeOniActor({ oni_status_solar: true });
        const data = oniPanelData(oni);
        assert.equal(data.regenerationBlocked, true);
        assert.ok(data.regenerationBlockers.includes('solar'));
    });

    it('retorna null para nao-Oni', () => {
        assert.equal(oniPanelData(makeSlayerActor()), null);
    });
});

describe('gm-panel-data - Oni Minion', () => {
    it('extrai PDV/PDK e traco do Minion', () => {
        const data = minionPanelData(makeOniMinionActor());
        assert.ok(data);
        assert.equal(data.kind, 'oni_minion');
        assert.equal(data.pdv.maximum, 10);
        assert.equal(data.pdk.maximum, 4);
        assert.equal(data.tipo, 'Fraco');
        assert.equal(data.nivel, 1);
        assert.equal(data.pacote, 'Rapido');
    });

    it('retorna null para nao-Minion', () => {
        assert.equal(minionPanelData(makeOniActor()), null);
    });
});

describe('gm-panel-data - buildGmPanelData', () => {
    it('separa combatentes por tipo', () => {
        const actors = [makeSlayerActor(), makeOniActor(), makeOniMinionActor(), makeNpcActor()];
        const panel = buildGmPanelData(actors);
        assert.equal(panel.totals.slayers, 1);
        assert.equal(panel.totals.onis, 1);
        assert.equal(panel.totals.minions, 1);
        assert.equal(panel.totals.npcs, 1);
        assert.equal(panel.slayers[0].name, 'Kwon Jisoo');
        assert.equal(panel.onis[0].name, 'Yokai Onryo');
        assert.equal(panel.minions[0].name, 'Lacaio Rapido');
    });

    it('lista vazia retorna totais zerados', () => {
        const panel = buildGmPanelData([]);
        assert.equal(panel.totals.slayers, 0);
        assert.equal(panel.totals.onis, 0);
        assert.equal(panel.totals.minions, 0);
        assert.equal(panel.totals.npcs, 0);
    });

    it('funciona com multiplos Slayers e Onis', () => {
        const actors = [
            makeSlayerActor(),
            makeSlayerActor({ nome_slayer: 'Outro' }),
            makeOniActor(),
            makeOniMinionActor(),
        ];
        const panel = buildGmPanelData(actors);
        assert.equal(panel.totals.slayers, 2);
        assert.equal(panel.totals.onis, 1);
        assert.equal(panel.totals.minions, 1);
    });
});
