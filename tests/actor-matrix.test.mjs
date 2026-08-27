import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actorKind, isOniActor, isSlayerActor, isOniMinionActor } from '../scripts/actor-kind.mjs';
import {
    makeSlayerActor,
    makeOniActor,
    makeOniMinionActor,
    makeNpcActor,
    SEVEN_ATTRIBUTES,
    EXPECTED,
} from './fixtures/actors.mjs';

describe('Matriz de Actors — classificacao e contratos', () => {
    const slayer = makeSlayerActor();
    const oni = makeOniActor();
    const minion = makeOniMinionActor();
    const npc = makeNpcActor();

    describe('classificacao actorKind', () => {
        it('Slayer classifica como slayer', () => {
            assert.equal(actorKind(slayer), 'slayer');
        });

        it('Oni classifica como oni', () => {
            assert.equal(actorKind(oni), 'oni');
        });

        it('Oni Minion classifica como oni_minion', () => {
            assert.equal(actorKind(minion), 'oni_minion');
        });

        it('NPC classifica como npc (P0: NPC agora tem PDV e recebe dano via relay)', () => {
            assert.equal(actorKind(npc), 'npc');
        });
    });

    describe('helpers de classificacao', () => {
        it('isSlayerActor reconhece apenas Slayer', () => {
            assert.equal(isSlayerActor(slayer), true);
            assert.equal(isSlayerActor(oni), false);
            assert.equal(isSlayerActor(minion), false);
            assert.equal(isSlayerActor(npc), false);
        });

        it('isOniActor reconhece apenas Oni completo', () => {
            assert.equal(isOniActor(slayer), false);
            assert.equal(isOniActor(oni), true);
            assert.equal(isOniActor(minion), false);
            assert.equal(isOniActor(npc), false);
        });

        it('isOniMinionActor reconhece apenas Oni Minion', () => {
            assert.equal(isOniMinionActor(slayer), false);
            assert.equal(isOniMinionActor(oni), false);
            assert.equal(isOniMinionActor(minion), true);
            assert.equal(isOniMinionActor(npc), false);
        });
    });

    describe('recursos por namespace', () => {
        it('Slayer usa PDV/PDR com namespace slayer', () => {
            const props = slayer.system.props;
            assert.equal(props[EXPECTED.slayer.resourcePrimary], 24);
            assert.equal(props[EXPECTED.slayer.resourceSecondary], 12);
            assert.ok(props.pdv_slayer_dano_tomado !== undefined, 'Slayer tem dano tomado');
            assert.ok(props.pdv_slayer_dano_ferida !== undefined, 'Slayer tem dano ferida');
        });

        it('Oni usa PDV/PDK com namespace oni', () => {
            const props = oni.system.props;
            assert.equal(props[EXPECTED.oni.resourcePrimary], 40);
            assert.equal(props[EXPECTED.oni.resourceSecondary], 8);
            assert.ok(props.pdv_oni_dano_tomado !== undefined, 'Oni tem dano tomado');
            assert.ok(props.pdv_oni_dano_ferida !== undefined, 'Oni tem dano ferida');
            assert.ok(props.pdk_oni_gasto_valor !== undefined, 'Oni tem gasto de PDK');
        });

        it('Oni Minion usa PDV/PDK de cena com namespace oni_minion', () => {
            const props = minion.system.props;
            assert.equal(props[EXPECTED.oni_minion.resourcePrimary], 10);
            assert.equal(props[EXPECTED.oni_minion.resourceSecondary], 4);
            assert.ok(props.oni_minion_pdv_dano !== undefined, 'Minion tem dano PDV');
            assert.ok(props.oni_minion_pdk_gasto !== undefined, 'Minion tem gasto PDK');
        });
    });

    describe('sete atributos finais numericos', () => {
        it('Slayer tem vit_display ate sab_display numericos', () => {
            for (const attr of SEVEN_ATTRIBUTES) {
                const key = `${attr}_display`;
                const val = slayer.system.props[key];
                assert.equal(typeof val, 'number', `Slayer ${key} deve ser numero`);
                assert.ok(val > 0, `Slayer ${key} deve ser positivo`);
            }
        });

        it('Oni tem vit_display ate sab_display numericos', () => {
            for (const attr of SEVEN_ATTRIBUTES) {
                const key = `${attr}_display`;
                const val = oni.system.props[key];
                assert.equal(typeof val, 'number', `Oni ${key} deve ser numero`);
                assert.ok(val > 0, `Oni ${key} deve ser positivo`);
            }
        });

        it('Oni Minion tem oni_minion_vit_base ate oni_minion_sab_base numericos', () => {
            for (const attr of SEVEN_ATTRIBUTES) {
                const key = `oni_minion_${attr}_base`;
                const val = minion.system.props[key];
                assert.equal(typeof val, 'number', `Minion ${key} deve ser numero`);
                assert.ok(val >= 0, `Minion ${key} deve ser nao-negativo`);
            }
        });
    });

    describe('isolamento de namespace', () => {
        it('Slayer nao expoe keys oni', () => {
            const props = slayer.system.props;
            assert.equal(props.pdv_oni_total_valor, undefined);
            assert.equal(props.pdk_oni_total_valor, undefined);
            assert.equal(props.oni_minion_nome, undefined);
        });

        it('Oni nao expoe keys slayer', () => {
            const props = oni.system.props;
            assert.equal(props.nome_slayer, undefined);
            assert.equal(props.pdv_slayer_total_valor, undefined);
            assert.equal(props.pdr_slayer_total_valor, undefined);
            assert.equal(props.oni_minion_nome, undefined);
        });

        it('Oni Minion nao expoe keys slayer nem oni', () => {
            const props = minion.system.props;
            assert.equal(props.nome_slayer, undefined);
            assert.equal(props.pdv_slayer_total_valor, undefined);
            assert.equal(props.nome_oni, undefined);
            assert.equal(props.pdv_oni_total_valor, undefined);
            assert.equal(props.pdk_oni_total_valor, undefined);
        });
    });

    describe('fixture canônica do blueprint Minion (Rápido/Fraco/Nível 1)', () => {
        it('pacote Rápido tem VIT 1 DEX 4 FOR 1 CAR 0 FDV 2 INT 0 SAB 3', () => {
            const p = minion.system.props;
            assert.equal(p.oni_minion_vit_base, 1);
            assert.equal(p.oni_minion_dex_base, 4);
            assert.equal(p.oni_minion_for_base, 1);
            assert.equal(p.oni_minion_car_base, 0);
            assert.equal(p.oni_minion_fdv_base, 2);
            assert.equal(p.oni_minion_int_base, 0);
            assert.equal(p.oni_minion_sab_base, 3);
        });

        it('Fraco nível 1 tem PDV 10 e PDK 4', () => {
            assert.equal(minion.system.props.oni_minion_pdv_base, 10);
            assert.equal(minion.system.props.oni_minion_pdk_base, 4);
        });
    });
});
