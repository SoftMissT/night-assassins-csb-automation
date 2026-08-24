import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actorWeapons,
  addStoneBreak,
  addStoneBreakForAction,
  clearStonePassiveState,
  effectiveWeaponCritical,
  isPassiveItem,
  parseBreathPassiveState,
  registerConfirmedCritical,
  registerStoneConfirmedDamage,
  stoneBreakStacks,
  stoneConfirmedDamageForTarget,
} from "../scripts/breath-passives.mjs";

describe("passivas de Respiração", () => {
  it("lista arma legada da ficha com perfil e atributo de ataque", () => {
    const actor = {
      system: { props: { nvl_num: 1, dex_display: 5 } },
      items: [{
        id: "legacy-weapon",
        uuid: "Actor.slayer.Item.legacy-weapon",
        name: "Arco Longo",
        system: { props: {
          arma_nome: "Arco Longo",
          arma_dano_fixo: 3,
          arma_dano_atributo: ["DEX"],
          arma_tipos_dano: ["perfurante"],
          arma_regra_completa: "Dano: 3 + Metade da DEX",
        } },
      }],
    };
    const [weapon] = actorWeapons(actor);
    assert.equal(weapon.profileName, "Ataque Base");
    assert.deepEqual(weapon.attackAttributes, ["DEX"]);
    assert.equal(weapon.attacks, 1);
  });

  it("usa o crítico da arma e reduz com Quebra até o limite de FOR", () => {
    let state = parseBreathPassiveState("");
    for (let i = 0; i < 8; i += 1) state = addStoneBreak(state, "katana", 3);
    assert.equal(state.stone.breakByWeapon.katana, 3);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "katana", strength: 3 }), 16);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "machado", strength: 3 }), 19);
  });

  it("respeita o piso global do crítico sem misturar acúmulos entre armas", () => {
    let state = parseBreathPassiveState("");
    for (let i = 0; i < 8; i += 1) state = addStoneBreak(state, "katana", 8);

    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "katana", strength: 8, floor: 15 }), 15);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "machado", strength: 8, floor: 15 }), 19);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "katana", strength: 8 }), 11);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "katana", strength: 8, floor: 99 }), 19);
    assert.equal(effectiveWeaponCritical({ base: 19, state, weaponId: "katana", strength: 8, floor: -4 }), 11);
  });

  it("registra Martelo do Julgamento somente após crítico confirmado", () => {
    const state = registerConfirmedCritical(parseBreathPassiveState(""), {
      weaponId: "katana", weaponName: "Nichirin", natural: 18, threshold: 18,
    });
    assert.equal(state.metal.hammerPending, true);
    assert.deepEqual(state.lastCritical, { weaponId: "katana", weaponName: "Nichirin", natural: 18, threshold: 18 });
  });

  it("não trata passivas de Metal e Neve como formas executáveis", () => {
    assert.equal(isPassiveItem("metal_05"), true);
    assert.equal(isPassiveItem("neve_08"), true);
    assert.equal(isPassiveItem("nevoa_06"), false);
  });
});

describe("pipeline confirmado da Pedra", () => {
  it("aplica no máximo uma Quebra por ação", () => {
    const first = addStoneBreakForAction({}, "weapon-a", 5, "action-1");
    const duplicate = addStoneBreakForAction(first, "weapon-a", 5, "action-1");
    const nextAction = addStoneBreakForAction(duplicate, "weapon-a", 5, "action-2");
    assert.equal(stoneBreakStacks(duplicate, "weapon-a"), 1);
    assert.equal(stoneBreakStacks(nextAction, "weapon-a"), 2);
  });

  it("recupera somente o dano confirmado no mesmo alvo e turno", () => {
    const state = registerStoneConfirmedDamage({}, {
      targetUuid: "Actor.target", damage: 27, actionId: "attack-1",
      combatId: "Combat.one", round: 3, turn: 2, weaponId: "weapon-a",
    });
    assert.equal(stoneConfirmedDamageForTarget(state, "Actor.target", { combatId: "Combat.one", round: 3, turn: 2 }).damage, 27);
    assert.equal(stoneConfirmedDamageForTarget(state, "Actor.other", { combatId: "Combat.one", round: 3, turn: 2 }), null);
    assert.equal(stoneConfirmedDamageForTarget(state, "Actor.target", { combatId: "Combat.one", round: 3, turn: 3 }), null);
  });

  it("limpa Quebra e o último dano quando o combate termina", () => {
    const cleared = clearStonePassiveState({ stone: { breakByWeapon: { katana: 3 }, lastConfirmedDamageByTarget: { a: { damage: 5 } } }, metal: { hammerPending: true } });
    assert.equal(cleared.stone, undefined);
    assert.equal(cleared.metal.hammerPending, true);
  });
});
