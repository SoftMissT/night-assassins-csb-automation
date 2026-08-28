import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureOniProgression,
  missingOniPdvGains,
  oniRandomPdvRequirements,
} from '../scripts/oni/progression-service.mjs';
import { oniReadyCatchUp } from '../scripts/oni/progression-engine.mjs';

function fakeActor(props = {}) {
  const patches = [];
  return {
    props,
    patches,
    name: 'Oni Teste',
    uuid: 'Actor.test',
    isOwner: true,
    system: { props },
    update(patch) {
      patches.push(patch);
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
  };
}

function fakeOniActorForEngine(props = {}) {
  const patches = [];
  return {
    props,
    patches,
    name: 'Oni Engine',
    uuid: 'Actor.engine',
    isOwner: true,
    system: { template: 'oni_template', props },
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
  };
}

function mockRoll(total) {
  globalThis.Roll = { create: () => ({ evaluate: async () => ({ total }) }) };
}

function unmockRoll() {
  delete globalThis.Roll;
}

function setupGlobals() {
  globalThis.game = {
    user: { id: 'gm1', isGM: true },
    users: { filter: () => [{ id: 'gm1', active: true, isGM: true }] },
    actors: { contents: [] },
    system: { id: 'custom-system-builder' },
  };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async () => null } } } };
  globalThis.Hooks = {
    _handlers: {},
    on(event, fn) {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(fn);
    },
    once(event, fn) {
      this.on(event, fn);
    },
    call(event, ...args) {
      for (const fn of this._handlers[event] ?? []) fn(...args);
    },
    callAll(event, ...args) {
      this.call(event, ...args);
    },
  };
}

function teardownGlobals() {
  delete globalThis.game;
  delete globalThis.Roll;
  delete globalThis.ui;
  delete globalThis.foundry;
  delete globalThis.Hooks;
  delete globalThis.ChatMessage;
}

describe('Engine de progressão Oni — PDV automático', () => {
  beforeEach(() => {
    setupGlobals();
    mockRoll(3);
  });

  afterEach(() => {
    unmockRoll();
    teardownGlobals();
  });

  describe('Dice map N2–N12', () => {
    it('N1 não exige nenhum ganho', async () => {
      const actor = fakeActor({ nvl_num: 1 });
      const result = await ensureOniProgression(actor);
      assert.equal(result.needed, false);
      assert.equal(result.complete, true);
      assert.equal(actor.patches.length, 0);
    });

    it('N2 → 1d4', async () => {
      const actor = fakeActor({ nvl_num: 2 });
      const result = await ensureOniProgression(actor, { level: 2 });
      assert.equal(result.needed, true);
      assert.equal(result.rolled.length, 1);
      assert.equal(result.rolled[0].dice, '1d4');
      assert.equal(result.rolled[0].level, 2);
      assert.ok(actor.props.pdv_oni_ganho_nvl2 >= 1);
    });

    it('N3 com N2 existente → somente N3', async () => {
      const actor = fakeActor({ nvl_num: 3, pdv_oni_ganho_nvl2: 3 });
      const result = await ensureOniProgression(actor, { level: 3 });
      assert.equal(result.needed, true);
      assert.equal(result.rolled.length, 1);
      assert.equal(result.rolled[0].level, 3);
      assert.equal(result.rolled[0].dice, '1d4');
      assert.equal(actor.props.pdv_oni_ganho_nvl2, 3);
      assert.ok(actor.props.pdv_oni_ganho_nvl3 >= 1);
    });

    it('N4 → 1d6', async () => {
      mockRoll(5);
      const actor = fakeActor({ nvl_num: 4 });
      const result = await ensureOniProgression(actor, { level: 4 });
      assert.equal(result.needed, true);
      const n4 = result.rolled.find((r) => r.level === 4);
      assert.ok(n4);
      assert.equal(n4.dice, '1d6');
    });

    it('N7 → 2d4', async () => {
      mockRoll(6);
      const actor = fakeActor({ nvl_num: 7 });
      const result = await ensureOniProgression(actor, { level: 7 });
      const n7 = result.rolled.find((r) => r.level === 7);
      assert.ok(n7);
      assert.equal(n7.dice, '2d4');
    });

    it('N10 → 2d6', async () => {
      mockRoll(8);
      const actor = fakeActor({ nvl_num: 10 });
      const result = await ensureOniProgression(actor, { level: 10 });
      const n10 = result.rolled.find((r) => r.level === 10);
      assert.ok(n10);
      assert.equal(n10.dice, '2d6');
    });

    it('N12 → 2d6', async () => {
      mockRoll(9);
      const actor = fakeActor({ nvl_num: 12 });
      const result = await ensureOniProgression(actor, { level: 12 });
      const n12 = result.rolled.find((r) => r.level === 12);
      assert.ok(n12);
      assert.equal(n12.dice, '2d6');
    });
  });

  describe('Publicação visual da rolagem', () => {
    it('publica Roll no chat para o Dice So Nice observar', async () => {
      let messages = 0;
      let directDice3d = 0;
      globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.uuid }) };
      globalThis.game.dice3d = { showForRoll: async () => { directDice3d += 1; } };
      globalThis.Roll = {
        create: () => {
          const roll = {
            total: 3,
            async evaluate() { return roll; },
            async toMessage() { messages += 1; },
          };
          return roll;
        },
      };
      const actor = fakeActor({ nvl_num: 2 });

      await ensureOniProgression(actor, { level: 2, showDice: true });

      assert.equal(messages, 1);
      assert.equal(directDice3d, 0, 'toMessage evita exibição duplicada no Dice So Nice');
    });
  });

  describe('Level jump', () => {
    it('N1→N8: 7 rolls em 1 update', async () => {
      mockRoll(4);
      const actor = fakeActor({ nvl_num: 8 });
      const result = await ensureOniProgression(actor, { level: 8 });
      assert.equal(result.needed, true);
      assert.equal(result.rolled.length, 7);
      assert.deepEqual(
        result.rolled.map((r) => r.level),
        [2, 3, 4, 5, 6, 7, 8]
      );
      assert.equal(actor.patches.length, 1);
    });
  });

  describe('Idempotência', () => {
    it('ensureOniProgression ×3 → somente 1º rola', async () => {
      mockRoll(3);
      const actor = fakeActor({ nvl_num: 5 });
      const first = await ensureOniProgression(actor, { level: 5 });
      assert.equal(first.needed, true);
      assert.equal(first.rolled.length, 4);
      const second = await ensureOniProgression(actor, { level: 5 });
      assert.equal(second.needed, false);
      assert.equal(second.rolled.length, 0);
      const third = await ensureOniProgression(actor, { level: 5 });
      assert.equal(third.needed, false);
      assert.equal(actor.patches.length, 1);
    });
  });

  describe('Level down/up', () => {
    it('N8→N5 preserva gains N6..N8', async () => {
      const props = { nvl_num: 8 };
      for (let i = 2; i <= 8; i++) props[`pdv_oni_ganho_nvl${i}`] = 3;
      const actor = fakeActor(props);
      mockRoll(9);
      const result = await ensureOniProgression(actor, { level: 5 });
      assert.equal(result.needed, false);
      assert.equal(props.pdv_oni_ganho_nvl6, 3);
      assert.equal(props.pdv_oni_ganho_nvl7, 3);
      assert.equal(props.pdv_oni_ganho_nvl8, 3);
      assert.equal(actor.patches.length, 0);
    });

    it('N5→N8 não rerrola gains existentes', async () => {
      const props = { nvl_num: 5 };
      for (let i = 2; i <= 5; i++) props[`pdv_oni_ganho_nvl${i}`] = 2;
      const actor = fakeActor(props);
      mockRoll(7);
      const result = await ensureOniProgression(actor, { level: 8 });
      assert.equal(result.needed, true);
      assert.deepEqual(
        result.rolled.map((r) => r.level),
        [6, 7, 8]
      );
      assert.equal(actor.patches.length, 1);
    });
  });

  describe('Persistência', () => {
    it('valores ficam em system.props', async () => {
      mockRoll(4);
      const actor = fakeActor({ nvl_num: 3 });
      await ensureOniProgression(actor, { level: 3 });
      assert.equal(typeof actor.props.pdv_oni_ganho_nvl2, 'number');
      assert.ok(actor.props.pdv_oni_ganho_nvl2 >= 1);
      assert.equal(typeof actor.props.pdv_oni_ganho_nvl3, 'number');
      assert.ok(actor.props.pdv_oni_ganho_nvl3 >= 1);
    });

    it('patch único contém todas as chaves', async () => {
      mockRoll(3);
      const actor = fakeActor({ nvl_num: 6 });
      await ensureOniProgression(actor, { level: 6 });
      assert.equal(actor.patches.length, 1);
      const keys = Object.keys(actor.patches[0]).filter((k) => k.startsWith('system.props.pdv_oni_ganho'));
      assert.equal(keys.length, 5);
    });
  });

  describe('PATCH com naCsbAutomation', () => {
    it('update é chamado com naCsbAutomation: true', async () => {
      mockRoll(3);
      const actor = fakeOniActorForEngine({ nvl_num: 2 });
      await ensureOniProgression(actor, { level: 2 });
      assert.equal(actor.patches.length, 1);
      assert.equal(actor.patches[0].options?.naCsbAutomation, true);
    });
  });

  describe('Concorrência', () => {
    it('chamadas sequenciais não duplicam rolls', async () => {
      mockRoll(4);
      const actor = fakeActor({ nvl_num: 10 });
      const r1 = await ensureOniProgression(actor, { level: 10 });
      assert.equal(r1.needed, true);
      assert.equal(r1.rolled.length, 9);
      const r2 = await ensureOniProgression(actor, { level: 10 });
      assert.equal(r2.needed, false);
      assert.equal(r2.rolled.length, 0);
      assert.equal(actor.patches.length, 1);
    });
  });

  describe('READY catch-up', () => {
    it('GM autoritativo reconcilia Onis com ganhos faltantes', async () => {
      const props = { nvl_num: 4, nome_oni: 'Teste' };
      const actor = fakeActor(props);
      globalThis.game.actors.contents = [actor];
      mockRoll(5);

      await oniReadyCatchUp();

      assert.equal(actor.patches.length, 1);
      assert.ok(props.pdv_oni_ganho_nvl2 >= 1);
      assert.ok(props.pdv_oni_ganho_nvl3 >= 1);
      assert.ok(props.pdv_oni_ganho_nvl4 >= 1);
    });

    it('player não executa catch-up', async () => {
      globalThis.game.user = { id: 'player1', isGM: false };
      const props = { nvl_num: 3 };
      const actor = fakeActor(props);
      globalThis.game.actors.contents = [actor];
      mockRoll(3);

      await oniReadyCatchUp();

      assert.equal(actor.patches.length, 0);
    });
  });

  describe('Não depende de enableSheetAutomation', () => {
    it('engine funciona mesmo com setting desabilitada', async () => {
      mockRoll(4);
      const actor = fakeActor({ nvl_num: 5 });
      const result = await ensureOniProgression(actor, { level: 5 });
      assert.equal(result.needed, true);
      assert.equal(result.rolled.length, 4);
    });
  });

  describe('nvl_pj string format', () => {
    it('aceita "nvl_4" como input', async () => {
      mockRoll(3);
      const actor = fakeActor({ nvl_pj: 'nvl_4' });
      const result = await ensureOniProgression(actor, { level: 4 });
      assert.equal(result.needed, true);
      assert.equal(result.rolled.length, 3);
    });
  });
});
