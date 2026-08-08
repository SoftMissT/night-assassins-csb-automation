import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { buildWaterBreathingPlan, parseWaterBreathingState, tickWaterBreathing } from "../scripts/breath-service.mjs";
import { WATER_BREATHING_FORMS, WATER_BREATH_TEMPLATE_ID } from "../scripts/water-breathing-data.mjs";

const props = {
  nvl_respiracao_num: 4, int_display: 3, dex_display: 4, deslocamento_slayer: 11,
  resp_agua_estado: '{"version":1}', resp_agua_08_recarga_turno: 0, resp_agua_11_usos_hoje: 0,
};

describe("Respiração da Água", () => {
  it("cataloga as onze Formas com IDs Foundry estáveis", () => {
    assert.equal(WATER_BREATHING_FORMS.length, 11);
    assert.equal(WATER_BREATH_TEMPLATE_ID.length, 16);
    assert.deepEqual(WATER_BREATHING_FORMS.map((form) => form.order), [1,2,3,4,5,6,7,8,9,10,11]);
    assert.ok(WATER_BREATHING_FORMS.every((form) => form.documentId.length === 16));
  });

  it("1ª Forma persiste o dano para o próximo ataque", () => {
    const plan = buildWaterBreathingPlan("agua_01", 4, props);
    assert.equal(plan.cost, 3);
    assert.equal(plan.patch["system.props.resp_bonus_dano_dados"], "4d6");
    assert.equal(parseWaterBreathingState(plan.patch["system.props.resp_agua_estado"]).pendingDamage.uses, 1);
  });

  it("2ª Forma falha sem gastar PDR quando não supera o pulo", () => {
    const fail = buildWaterBreathingPlan("agua_02", 1, props, { jumpPassed: false });
    assert.equal(fail.ok, false);
    assert.equal(fail.noCost, true);
    const success = buildWaterBreathingPlan("agua_02", 1, props, { jumpPassed: true, special: true });
    assert.equal(success.cost, 3);
    assert.equal(success.action, "especial");
  });

  it("3ª Forma prepara três Acertos contra alvos distintos", () => {
    const state = parseWaterBreathingState(buildWaterBreathingPlan("agua_03", 4, props).patch["system.props.resp_agua_estado"]);
    assert.equal(state.nextHit.count, 3);
    assert.equal(state.nextHit.distinctTargets, true);
    assert.equal(state.pendingDamage.uses, 3);
  });

  it("4ª e 5ª Formas exigem seus triggers", () => {
    assert.equal(buildWaterBreathingPlan("agua_04", 1, props).ok, false);
    assert.equal(buildWaterBreathingPlan("agua_04", 1, props, { triggerConfirmed: true }).ok, true);
    assert.equal(buildWaterBreathingPlan("agua_05", 2, props).ok, false);
    const fifth = buildWaterBreathingPlan("agua_05", 2, props, { targetIncapacitated: true });
    assert.equal(parseWaterBreathingState(fifth.patch["system.props.resp_agua_estado"]).pendingDamage.critical, true);
  });

  it("6ª e 7ª Formas aplicam área, submersão, Bloqueio e combo", () => {
    const sixth = buildWaterBreathingPlan("agua_06", 4, props, { submerged: true });
    assert.equal(sixth.patch["system.props.resp_bonus_acerto_temp"], 3);
    assert.equal(parseWaterBreathingState(sixth.patch["system.props.resp_agua_estado"]).pendingDamage.area, true);
    const seventh = buildWaterBreathingPlan("agua_07", 3, props);
    assert.equal(seventh.patch["system.props.resp_bonus_bloqueio_temp"], 3);
    assert.equal(parseWaterBreathingState(seventh.patch["system.props.resp_agua_estado"]).block.comboWater6, true);
  });

  it("8ª Forma impõe recarga e a 9ª dura dois turnos", () => {
    const eighth = buildWaterBreathingPlan("agua_08", 4, props);
    assert.equal(eighth.patch["system.props.resp_agua_08_recarga_turno"], 3);
    assert.equal(buildWaterBreathingPlan("agua_08", 4, { ...props, resp_agua_08_recarga_turno: 1 }).ok, false);
    const ninth = buildWaterBreathingPlan("agua_09", 4, props);
    assert.equal(ninth.patch["system.props.resp_bonus_esquiva_temp"], 3);
    assert.equal(ninth.patch["system.props.resp_efeito_duracao"], 2);
  });

  it("10ª Forma carrega por turno e só libera após uma carga", () => {
    const start = buildWaterBreathingPlan("agua_10", 2, props, { release: false });
    assert.equal(start.cost, 0);
    const chargedProps = { ...props, resp_agua_estado: start.patch["system.props.resp_agua_estado"] };
    const ticked = tickWaterBreathing(chargedProps);
    assert.equal(ticked["system.props.resp_carga_acumulada"], 1);
    const release = buildWaterBreathingPlan("agua_10", 2, { ...props, resp_agua_estado: ticked["system.props.resp_agua_estado"] }, { release: true, charges: 1 });
    assert.equal(release.ok, true);
    assert.match(release.patch["system.props.resp_bonus_dano_dados"], /1d8/);
  });

  it("11ª Forma respeita os usos diários do nível", () => {
    assert.equal(buildWaterBreathingPlan("agua_11", 2, props).ok, true);
    assert.equal(buildWaterBreathingPlan("agua_11", 2, { ...props, resp_agua_11_usos_hoje: 1 }).ok, false);
    assert.equal(buildWaterBreathingPlan("agua_11", 4, { ...props, resp_agua_11_usos_hoje: 2 }).ok, true);
  });

  it("gera um template e onze Items para o Compêndio", async () => {
    const exported = JSON.parse(await readFile(new URL("../csb-respiracao-forma-export.json", import.meta.url), "utf8"));
    const documents = exported.items;
    assert.equal(documents.length, 12);
    assert.equal(documents.filter((document) => document.type === "_equippableItemTemplate").length, 1);
    assert.equal(documents.filter((document) => document.type === "equippableItem").length, 11);
    assert.ok(documents.filter((document) => document.type === "equippableItem").every((document) => document.data.template === WATER_BREATH_TEMPLATE_ID));
  });
});
