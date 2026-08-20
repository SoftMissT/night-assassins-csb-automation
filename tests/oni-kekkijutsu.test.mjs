import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  KEKKIJUTSU_IDS,
  KEKKIJUTSU_ACTION_TYPES,
  getKekkijutsu,
  isKekkijutsuItem,
  normalizeKekkijutsu,
  validateKekkijutsuUse,
  buildKekkijutsuAttack,
  buildKekkijutsuUsePatch,
  buildKekkijutsuPdkPatch,
  resetKekkijutsuTurnState,
  resetKekkijutsuSceneState,
  kekkijutsuPotenciacao,
} from "../scripts/oni/kekkijutsu-service.mjs";

describe("kekkijutsu catalogo", () => {
  it("tem pelo menos 12 tecnicas catalogadas", () => {
    assert.ok(KEKKIJUTSU_IDS.length >= 12);
  });

  it("suporta 9 tipos de acao", () => {
    assert.ok(KEKKIJUTSU_ACTION_TYPES.length >= 9);
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("ataque"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("especial"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("reacao"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("completa"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("unica"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("lendaria"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("covil"));
    assert.ok(KEKKIJUTSU_ACTION_TYPES.includes("vilao"));
  });

  it("getKekkijutsu retorna tecnica por id", () => {
    const t = getKekkijutsu("kekki_coro_perdidos");
    assert.ok(t);
    assert.equal(t.name, "Coro dos Perdidos");
    assert.equal(t.action, "especial");
    assert.equal(t.pdkCost, 6);
  });

  it("getKekkijutsu retorna null para id inexistente", () => {
    assert.equal(getKekkijutsu("inexistente"), null);
  });

  it("isKekkijutsuItem detecta por template e props", () => {
    assert.equal(isKekkijutsuItem({ system: { template: "NAKekkijutsuTpl001" } }), true);
    assert.equal(isKekkijutsuItem({ system: { props: { kekki_id: "kekki_test" } } }), true);
    assert.equal(isKekkijutsuItem({ system: { props: {} } }), false);
  });
});

describe("kekkijutsu validate", () => {
  it("valida uso com nivel e PDK suficientes", () => {
    const tech = getKekkijutsu("kekki_coro_perdidos");
    const result = validateKekkijutsuUse(
      { system: { props: { nvl_num: 5, pdk_oni_atual_num: 10 } } },
      tech
    );
    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejeita nivel insuficiente", () => {
    const tech = getKekkijutsu("kekki_coluna_chama_negra");
    const result = validateKekkijutsuUse(
      { system: { props: { nvl_num: 5, pdk_oni_atual_num: 20 } } },
      tech
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Nível insuficiente")));
  });

  it("rejeita PDK insuficiente", () => {
    const tech = getKekkijutsu("kekki_coro_perdidos");
    const result = validateKekkijutsuUse(
      { system: { props: { nvl_num: 5, pdk_oni_atual_num: 2 } } },
      tech
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("PDK insuficiente")));
  });

  it("rejeita se ja usado no turno", () => {
    const tech = getKekkijutsu("kekki_coro_perdidos");
    const result = validateKekkijutsuUse(
      { system: { props: { nvl_num: 5, pdk_oni_atual_num: 10, kekki_uso_kekki_coro_perdidos_turno: true } } },
      tech
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("já usado")));
  });

  it("rejeita uso de cena se ja usado", () => {
    const tech = getKekkijutsu("kekki_sonolencia_eterna");
    const result = validateKekkijutsuUse(
      { system: { props: { nvl_num: 9, pdk_oni_atual_num: 20, kekki_uso_kekki_sonolencia_eterna_cena: true } } },
      tech
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("cena/combate")));
  });
});

describe("kekkijutsu attack builder", () => {
  it("buildKekkijutsuAttack monta acerto com dano", () => {
    const tech = getKekkijutsu("kekki_expiracao_cinza");
    const attack = buildKekkijutsuAttack(tech, { vit: 5 });
    assert.equal(attack.techniqueName, "Expiração da Cinza");
    assert.equal(attack.action, "ataque");
    assert.equal(attack.pdkCost, 5);
    assert.equal(attack.damage.length, 1);
    assert.equal(attack.damage[0].types[0], "fogo");
    assert.equal(attack.testType, "vit");
    assert.ok(attack.attributeTerms.length > 0);
    assert.ok(attack.status.includes("cicatriz_negra"));
  });

  it("buildKekkijutsuAttack sem dano tem damage vazio", () => {
    const tech = getKekkijutsu("kekki_fenda_outro_mundo");
    const attack = buildKekkijutsuAttack(tech, {});
    assert.equal(attack.damage.length, 0);
    assert.equal(attack.testType, "none");
    assert.equal(attack.attributeTerms.length, 0);
  });
});

describe("kekkijutsu estado e resets", () => {
  it("buildKekkijutsuUsePatch marca uso no turno", () => {
    const tech = getKekkijutsu("kekki_coro_perdidos");
    const patch = buildKekkijutsuUsePatch(tech);
    assert.equal(patch["system.props.kekki_uso_kekki_coro_perdidos_turno"], true);
  });

  it("buildKekkijutsuUsePatch marca uso de cena para limites 1x/cena", () => {
    const tech = getKekkijutsu("kekki_sonolencia_eterna");
    const patch = buildKekkijutsuUsePatch(tech);
    assert.equal(patch["system.props.kekki_uso_kekki_sonolencia_eterna_cena"], true);
  });

  it("buildKekkijutsuPdkPatch soma ao gasto acumulado", () => {
    const patch = buildKekkijutsuPdkPatch(3, 5);
    assert.equal(patch["system.props.pdk_oni_gasto_valor"], 8);
  });

  it("resetKekkijutsuTurnState limpa usos de turno", () => {
    const patch = resetKekkijutsuTurnState({ kekki_uso_kekki_test_turno: true });
    assert.equal(patch["system.props.kekki_uso_kekki_test_turno"], false);
  });

  it("resetKekkijutsuSceneState limpa usos de cena/combate", () => {
    const patch = resetKekkijutsuSceneState({ kekki_uso_kekki_test_cena: true, kekki_uso_kekki_test_combate: true });
    assert.equal(patch["system.props.kekki_uso_kekki_test_cena"], false);
    assert.equal(patch["system.props.kekki_uso_kekki_test_combate"], false);
  });
});

describe("kekkijutsu potenciacao", () => {
  it("Sonolencia Eterna tem potenciacao com +4 PDK", () => {
    const tech = getKekkijutsu("kekki_sonolencia_eterna");
    const pot = kekkijutsuPotenciacao(tech, 4);
    assert.ok(pot);
    assert.equal(pot.extraPdk, 4);
    assert.equal(pot.rangeBonus, 3);
    assert.equal(pot.cdBonus, 3);
    assert.equal(pot.totalPdkCost, 10);
  });

  it("tecnica sem potenciacao retorna null", () => {
    const tech = getKekkijutsu("kekki_coro_perdidos");
    assert.equal(kekkijutsuPotenciacao(tech, 4), null);
  });
});
