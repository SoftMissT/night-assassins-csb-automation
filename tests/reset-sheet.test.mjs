import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSlayerForReset,
  buildSlayerResetPatch,
  resetSlayerSheetState,
} from '../scripts/reset-slayer-service.mjs';
import {
  isOniForReset,
  buildOniResetPatch,
  resetOniSheetState,
} from '../scripts/oni/reset-oni-service.mjs';

function fakeSlayerActor(props = {}) {
  const patches = [];
  return {
    props,
    patches,
    name: 'Slayer Teste',
    uuid: 'Actor.slayer',
    ownership: {},
    system: { props },
    update(patch, options) {
      patches.push({ patch, options });
      Object.assign(
        props,
        Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [
            k.replace(/^system\.props\./, ''),
            v,
          ])
        )
      );
      return Promise.resolve();
    },
    sheet: { rendered: false },
  };
}

function fakeOniActor(props = {}) {
  const patches = [];
  return {
    props,
    patches,
    name: 'Oni Teste',
    uuid: 'Actor.oni',
    ownership: {},
    system: { props },
    update(patch, options) {
      patches.push({ patch, options });
      Object.assign(
        props,
        Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [
            k.replace(/^system\.props\./, ''),
            v,
          ])
        )
      );
      return Promise.resolve();
    },
    sheet: { rendered: false },
  };
}

describe('reset-slayer-service', () => {
  describe('isSlayerForReset', () => {
    it('returns true for valid Slayer', () => {
      const actor = fakeSlayerActor({ nome_slayer: 'Tanjiro', pdv_slayer_total_valor: 20 });
      assert.ok(isSlayerForReset(actor));
    });

    it('returns false for Oni', () => {
      const actor = fakeSlayerActor({ nvl_oni: 1 });
      assert.ok(!isSlayerForReset(actor));
    });

    it('returns false for empty actor', () => {
      assert.ok(!isSlayerForReset({ system: { props: {} } }));
    });
  });

  describe('buildSlayerResetPatch', () => {
    it('resets damage, heal, extra, pdrGasto', () => {
      const actor = fakeSlayerActor({
        pdv_slayer_dano_tomado: 5,
        pdv_slayer_curado: 3,
        pdv_slayer_extra: 2,
        pdr_slayer_gasto_valor: 4,
        pdr_slayer_curado: 1,
        fdv_display: 2,
        folego_slayer_maximo: 5,
        folego_slayer_atual: 2,
      });

      const { patch, summary } = buildSlayerResetPatch(actor);

      assert.equal(patch['system.props.pdv_slayer_dano_tomado'], 0);
      assert.equal(patch['system.props.pdv_slayer_curado'], 0);
      assert.equal(patch['system.props.pdv_slayer_extra'], 0);
      assert.equal(patch['system.props.pdr_slayer_gasto_valor'], 0);
      assert.equal(patch['system.props.pdr_slayer_curado'], 0);
      assert.equal(patch['system.props.folego_slayer_atual'], 5);
      assert.ok(summary.length >= 6);
    });

    it('restores folego to computed max (2 + fdv)', () => {
      const actor = fakeSlayerActor({
        pdv_slayer_dano_tomado: 0,
        pdv_slayer_curado: 0,
        pdv_slayer_extra: 0,
        pdr_slayer_gasto_valor: 0,
        pdr_slayer_curado: 0,
        fdv_display: 3,
        folego_slayer_maximo: undefined,
        folego_slayer_atual: 0,
      });

      const { patch } = buildSlayerResetPatch(actor);
      assert.equal(patch['system.props.folego_slayer_atual'], 5);
    });
  });

  describe('resetSlayerSheetState', () => {
    it('generates single update with naReset flag', async () => {
      const actor = fakeSlayerActor({
        nome_slayer: 'Tanjiro',
        pdv_slayer_total_valor: 20,
        pdv_slayer_dano_tomado: 5,
        pdv_slayer_curado: 3,
        pdv_slayer_extra: 2,
        pdr_slayer_gasto_valor: 4,
        pdr_slayer_curado: 1,
        fdv_display: 2,
        folego_slayer_maximo: 5,
        folego_slayer_atual: 2,
      });

      const result = await resetSlayerSheetState(actor);

      assert.ok(result.success);
      assert.equal(actor.patches.length, 1);
      assert.ok(actor.patches[0].options.naReset);
    });

    it('preserves permanent props', async () => {
      const actor = fakeSlayerActor({
        nome_slayer: 'Tanjiro',
        nvl_pj: 5,
        hab_escolhida: 'hab_escolhida_tato',
        pdv_slayer_total_valor: 20,
        pdv_slayer_total_conta: 20,
        pdv_slayer_dano_ferida: 2,
        pdv_slayer_dano_tomado: 5,
        pdv_slayer_curado: 3,
        pdv_slayer_extra: 2,
        pdr_slayer_gasto_valor: 4,
        pdr_slayer_curado: 1,
        fdv_display: 2,
        folego_slayer_maximo: 5,
        folego_slayer_atual: 2,
      });

      await resetSlayerSheetState(actor);

      assert.equal(actor.props.nvl_pj, 5);
      assert.equal(actor.props.hab_escolhida, 'hab_escolhida_tato');
      assert.equal(actor.props.pdv_slayer_total_valor, 20);
      assert.equal(actor.props.pdv_slayer_dano_ferida, 2);
      assert.equal(actor.props.pdv_slayer_dano_tomado, 0);
      assert.equal(actor.props.pdv_slayer_curado, 0);
      assert.equal(actor.props.pdv_slayer_extra, 0);
      assert.equal(actor.props.pdr_slayer_gasto_valor, 0);
      assert.equal(actor.props.pdr_slayer_curado, 0);
      assert.equal(actor.props.folego_slayer_atual, 5);
    });

    it('throws for non-Slayer', async () => {
      const actor = fakeSlayerActor({ nvl_oni: 1 });
      await assert.rejects(() => resetSlayerSheetState(actor), /não é um Slayer válido/);
    });
  });
});

describe('reset-oni-service', () => {
  describe('isOniForReset', () => {
    it('returns true for valid Oni', () => {
      const actor = fakeOniActor({ nvl_oni: 5, pdv_oni_ganho_nvl2: 3 });
      assert.ok(isOniForReset(actor));
    });

    it('returns false for Slayer', () => {
      const actor = fakeOniActor({ nome_slayer: 'Tanjiro' });
      assert.ok(!isOniForReset(actor));
    });

    it('returns false for empty actor', () => {
      assert.ok(!isOniForReset({ system: { props: {} } }));
    });
  });

  describe('buildOniResetPatch', () => {
    it('resets damage, heal, extra, pdkGasto', () => {
      const actor = fakeOniActor({
        nvl_oni: 5,
        pdv_oni_ganho_nvl2: 3,
        pdv_oni_dano_tomado: 4,
        pdv_oni_curado: 2,
        pdv_oni_extra: 1,
        pdk_oni_gasto_valor: 3,
        pdk_oni_curado: 1,
        pdv_oni_total_conta: 25,
        pdv_oni_maximo_num: 25,
        pdv_oni_atual_valor_display: 15,
        pdk_oni_total_conta: 20,
        pdk_oni_maximo_num: 20,
        pdk_oni_atual_valor_display: 10,
      });

      const { patch, summary } = buildOniResetPatch(actor);

      assert.equal(patch['system.props.pdv_oni_dano_tomado'], 0);
      assert.equal(patch['system.props.pdv_oni_curado'], 0);
      assert.equal(patch['system.props.pdv_oni_extra'], 0);
      assert.equal(patch['system.props.pdk_oni_gasto_valor'], 0);
      assert.equal(patch['system.props.pdk_oni_curado'], 0);
      assert.equal(patch['system.props.pdv_oni_atual_valor_display'], 25);
      assert.equal(patch['system.props.pdk_oni_atual_valor_display'], 20);
      assert.ok(summary.length >= 7);
    });
  });

  describe('resetOniSheetState', () => {
    it('generates single update with naReset flag', async () => {
      const actor = fakeOniActor({
        nvl_oni: 5,
        pdv_oni_ganho_nvl2: 3,
        pdv_oni_dano_tomado: 4,
        pdv_oni_curado: 2,
        pdv_oni_extra: 1,
        pdk_oni_gasto_valor: 3,
        pdk_oni_curado: 1,
        pdv_oni_total_conta: 25,
        pdv_oni_maximo_num: 25,
        pdv_oni_atual_valor_display: 15,
        pdk_oni_total_conta: 20,
        pdk_oni_maximo_num: 20,
        pdk_oni_atual_valor_display: 10,
      });

      const result = await resetOniSheetState(actor);

      assert.ok(result.success);
      assert.equal(actor.patches.length, 1);
      assert.ok(actor.patches[0].options.naReset);
    });

    it('preserves progression rolls and permanent props', async () => {
      const actor = fakeOniActor({
        nvl_oni: 5,
        nvl_pj: undefined,
        pdv_oni_ganho_nvl2: 3,
        pdv_oni_ganho_nvl3: 4,
        pdv_oni_ganho_nvl4: 2,
        pdv_oni_ganho_nvl5: 5,
        fdv_oni_nvl1: 3,
        origem_oni_pdv_val: 2,
        origem_oni_pdk_val: 1,
        pdv_oni_dano_tomado: 4,
        pdv_oni_curado: 2,
        pdv_oni_extra: 1,
        pdk_oni_gasto_valor: 3,
        pdk_oni_curado: 1,
        pdv_oni_total_conta: 25,
        pdv_oni_maximo_num: 25,
        pdv_oni_atual_valor_display: 15,
        pdk_oni_total_conta: 20,
        pdk_oni_maximo_num: 20,
        pdk_oni_atual_valor_display: 10,
      });

      await resetOniSheetState(actor);

      assert.equal(actor.props.nvl_oni, 5);
      assert.equal(actor.props.pdv_oni_ganho_nvl2, 3);
      assert.equal(actor.props.pdv_oni_ganho_nvl3, 4);
      assert.equal(actor.props.pdv_oni_ganho_nvl4, 2);
      assert.equal(actor.props.pdv_oni_ganho_nvl5, 5);
      assert.equal(actor.props.fdv_oni_nvl1, 3);
      assert.equal(actor.props.origem_oni_pdv_val, 2);
      assert.equal(actor.props.origem_oni_pdk_val, 1);
      assert.equal(actor.props.pdv_oni_dano_tomado, 0);
      assert.equal(actor.props.pdv_oni_curado, 0);
      assert.equal(actor.props.pdv_oni_extra, 0);
      assert.equal(actor.props.pdk_oni_gasto_valor, 0);
      assert.equal(actor.props.pdk_oni_curado, 0);
      assert.equal(actor.props.pdv_oni_atual_valor_display, 25);
      assert.equal(actor.props.pdk_oni_atual_valor_display, 20);
    });

    it('throws for non-Oni', async () => {
      const actor = fakeOniActor({ nome_slayer: 'Tanjiro' });
      await assert.rejects(() => resetOniSheetState(actor), /não é um Oni válido/);
    });

    it('is idempotent (double reset produces same result)', async () => {
      const props = {
        nvl_oni: 3,
        pdv_oni_ganho_nvl2: 3,
        pdv_oni_dano_tomado: 4,
        pdv_oni_curado: 2,
        pdv_oni_extra: 1,
        pdk_oni_gasto_valor: 3,
        pdk_oni_curado: 1,
        pdv_oni_total_conta: 25,
        pdv_oni_maximo_num: 25,
        pdv_oni_atual_valor_display: 15,
        pdk_oni_total_conta: 20,
        pdk_oni_maximo_num: 20,
        pdk_oni_atual_valor_display: 10,
      };
      const actor1 = fakeOniActor({ ...props });
      const actor2 = fakeOniActor({ ...props });

      await resetOniSheetState(actor1);
      await resetOniSheetState(actor2);

      assert.deepEqual(actor1.props, actor2.props);
    });
  });
});
