import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actorWeapons,
  addStoneBreak,
  effectiveWeaponCritical,
  isPassiveItem,
  parseBreathPassiveState,
  registerConfirmedCritical,
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
