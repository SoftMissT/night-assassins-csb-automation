import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addStoneBreak,
  effectiveWeaponCritical,
  isPassiveItem,
  parseBreathPassiveState,
  registerConfirmedCritical,
} from "../scripts/breath-passives.mjs";

describe("passivas de Respiração", () => {
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
