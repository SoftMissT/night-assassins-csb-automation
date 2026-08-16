/**
 * @fileoverview Motor GM-authoritativo de Vida e Morte dos Slayers.
 */

import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { consumeSlayerActions } from "./action-service.mjs";
import { formatStatusSummary, parseStatusState } from "./status-service.mjs";

const TURN_FLAG = "lastLifeDeathTurn";
const SOCKET_TYPE = "life-death-stabilize";
const resolving = new Set();

export function defaultLifeDeathState() {
  return {
    version: 1, dying: false, stabilized: false, dead: false, deathMarks: 0,
    fallsThisCombat: 0, finalDeterminationUsed: false, bondHelpUsed: false,
    combatId: "", lastTurnKey: "", lastPdv: null, lastDamage: 0, lastWound: 0,
  };
}

export function parseLifeDeathState(raw) {
  if (!raw) return defaultLifeDeathState();
  try {
    let value = raw;
    if (typeof value === "string") {
      value = value.replace(/<[^>]*>/g, "").replaceAll("&quot;", '"').replaceAll("&amp;", "&").trim();
      const first = value.indexOf("{");
      const last = value.lastIndexOf("}");
      if (first >= 0 && last > first) value = value.slice(first, last + 1);
      value = JSON.parse(value);
    }
    const base = defaultLifeDeathState();
    return {
      ...base, ...value,
      dying: Boolean(value?.dying), stabilized: Boolean(value?.stabilized), dead: Boolean(value?.dead),
      deathMarks: Math.max(0, Math.min(3, Math.trunc(Number(value?.deathMarks) || 0))),
      fallsThisCombat: Math.max(0, Math.min(4, Math.trunc(Number(value?.fallsThisCombat) || 0))),
      finalDeterminationUsed: Boolean(value?.finalDeterminationUsed), bondHelpUsed: Boolean(value?.bondHelpUsed),
      lastPdv: value?.lastPdv === null ? null : Math.max(0, Number(value?.lastPdv) || 0),
      lastDamage: Math.max(0, Number(value?.lastDamage) || 0), lastWound: Math.max(0, Number(value?.lastWound) || 0),
    };
  } catch {
    return defaultLifeDeathState();
  }
}

export function slayerCurrentPdv(props = {}) {
  const maximum = Math.max(0, parseNumber(props.pdv_slayer_total_conta) - parseNumber(props.pdv_slayer_dano_ferida) + parseNumber(props.pdv_slayer_extra));
  return Math.max(0, maximum + parseNumber(props.pdv_slayer_curado) - parseNumber(props.pdv_slayer_dano_tomado));
}

export function formatLifeDeathSummary(state) {
  if (state.dead) return "Morto";
  if (state.dying && state.stabilized) return `À Beira da Morte · Estabilizado · ${state.deathMarks}/3 Marcas`;
  if (state.dying) return `À Beira da Morte · ${state.deathMarks}/3 Marcas`;
  return "Estável";
}

function lifePatch(state) {
  return {
    "system.props.vida_morte_slayer_dados": JSON.stringify(state),
    "system.props.vida_morte_slayer_resumo": formatLifeDeathSummary(state),
    "system.props.vida_morte_slayer_marcas": state.deathMarks,
    "system.props.vida_morte_slayer_quedas": state.fallsThisCombat,
  };
}

function statusPatch(props, { add = [], remove = [], exhaustion = 0 } = {}) {
  const status = parseStatusState(props.status_slayer_dados);
  const active = new Set(status.active);
  for (const key of remove) { active.delete(key); delete status.effects[key]; }
  for (const key of add) active.add(key);
  status.active = [...active];
  status.exhaustion = Math.min(8, Math.max(status.exhaustion, Number(props.status_slayer_exaustao) || 0) + exhaustion);
  for (const key of add) {
    if (key === "desorientado" || key === "desequilibrado") {
      status.effects[key] = { damageFormula: "", remainingTurns: 1, sourceName: "Vida e Morte", saveAttr: "", saveDc: 0, stacks: 1, tick: "end" };
    }
  }
  return {
    "system.props.status_slayer_dados": JSON.stringify(status),
    "system.props.status_slayer_resumo": formatStatusSummary(status.active, status.exhaustion),
    "system.props.status_slayer_exaustao": status.exhaustion,
  };
}

function damageForCurrent(props, desired) {
  const maximum = Math.max(0, parseNumber(props.pdv_slayer_total_conta) - parseNumber(props.pdv_slayer_dano_ferida) + parseNumber(props.pdv_slayer_extra));
  return Math.max(0, maximum + parseNumber(props.pdv_slayer_curado) - Math.max(0, desired));
}

function isSlayer(actor) {
  const props = actor?.system?.props ?? {};
  return props.nome_slayer !== undefined || props.pdv_slayer_total_conta !== undefined;
}

function primaryActiveGm() {
  return game.users?.filter((user) => user.active && user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function isPrimaryGm() {
  return game.user?.isGM && primaryActiveGm()?.id === game.user.id;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function markDead(actor, state, reason) {
  state.dead = true; state.dying = false; state.stabilized = false;
  await actor.update({ ...lifePatch(state), ...statusPatch(actor.system.props, { remove: ["derrubado"] }) }, { naCsbAutomation: true, naLifeDeath: true });
  for (const combat of game.combats ?? []) {
    const updates = [...combat.combatants].filter((entry) => entry.actorId === actor.id && !entry.defeated).map((entry) => ({ _id: entry.id, defeated: true }));
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  }
  const name = escapeHtml(actor.name);
  const safeReason = escapeHtml(reason);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<strong>${name} morreu.</strong><br>${safeReason}` });
}

async function revive(actor, state, pdv, { exhaustion = 1, status = "desequilibrado", reason = "" } = {}) {
  const props = actor.system.props;
  state.dying = false; state.stabilized = false; state.dead = false; state.deathMarks = 0; state.lastPdv = pdv;
  await actor.update({
    ...lifePatch(state),
    ...statusPatch(props, { add: status ? [status] : [], remove: ["derrubado"], exhaustion }),
    "system.props.pdv_slayer_dano_tomado": damageForCurrent(props, pdv),
  }, { naCsbAutomation: true, naLifeDeath: true });
  const name = escapeHtml(actor.name);
  const safeReason = reason ? escapeHtml(reason) : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<strong>${name} voltou com ${pdv} PDV.</strong>${safeReason ? `<br>${safeReason}` : ""}` });
}

async function finalDetermination(actor, state, reason) {
  if (state.finalDeterminationUsed) return markDead(actor, state, `${reason}<br>Determinação Final já utilizada neste combate.`);
  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: `Determinação Final — ${actor.name}` }, modal: true, rejectClose: false,
    content: `<div class="na-csb-automation" style="display:grid;gap:9px"><p><strong>${reason}</strong></p><label>Motivo Forte<textarea name="motive" rows="3"></textarea></label><label>CD<select name="dc"><option value="15">15 — perigo comum</option><option value="18" selected>18 — Oni importante/crítico</option><option value="20">20 — chefe/morte dramática</option></select></label><label><input type="checkbox" name="bond"> Ajuda de Vínculo (+2)</label></div>`,
    buttons: [
      { action: "roll", label: "Tentar Determinação", callback: (_event, _button, dialog) => ({ motive: String(dialog.element.querySelector('[name="motive"]')?.value ?? "").trim(), dc: Number(dialog.element.querySelector('[name="dc"]')?.value ?? 18), bond: Boolean(dialog.element.querySelector('[name="bond"]')?.checked) }) },
      { action: "die", label: "Aceitar a morte", callback: () => null },
    ],
  });
  if (!decision?.motive) return markDead(actor, state, `${reason}<br>Nenhum Motivo Forte foi declarado.`);
  state.finalDeterminationUsed = true;
  const fdv = parseNumber(actor.system.props.fdv_display);
  const bonus = decision.bond && !state.bondHelpUsed ? 2 : 0;
  if (bonus) state.bondHelpUsed = true;
  const roll = await Roll.create(`1d20 + ${fdv} + ${bonus}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Determinação Final</strong> — FDV contra CD ${decision.dc}<br>${decision.motive}` });
  const natural = roll.dice?.[0]?.results?.[0]?.result;
  if (natural === 1) return markDead(actor, state, "1 natural: o corpo não responde.");
  if (natural === 20) {
    const recovery = await Roll.create("1d4").evaluate();
    return revive(actor, state, Math.max(1, recovery.total + parseNumber(actor.system.props.vit_display)), { exhaustion: 1, status: "desorientado", reason: "20 natural na Determinação Final." });
  }
  if (roll.total >= decision.dc) return revive(actor, state, 1, { exhaustion: 2, status: "desorientado", reason: "Determinação Final bem-sucedida." });
  return markDead(actor, state, "Determinação Final falhou.");
}

export async function processDeathTest(actor, { force = false } = {}) {
  if (!actor?.update || (!force && !isPrimaryGm())) return { processed: false };
  const state = parseLifeDeathState(actor.system.props.vida_morte_slayer_dados);
  if (!state.dying || state.stabilized || state.dead) return { processed: false };
  const roll = await Roll.create("1d20").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Teste de Morte — ${actor.name}</strong>` });
  const natural = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;
  if (natural === 1) {
    const recovery = await Roll.create("1d4").evaluate();
    await recovery.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Corpo resiste — recuperação" });
    await revive(actor, state, Math.max(1, recovery.total + parseNumber(actor.system.props.vit_display)), { exhaustion: 1, status: "desequilibrado", reason: "1 natural no Teste de Morte." });
  } else if (natural === 20) {
    await finalDetermination(actor, state, "20 natural no Teste de Morte.");
  } else if (natural >= 11) {
    state.deathMarks = Math.min(3, state.deathMarks + 1);
    if (state.deathMarks >= 3) await finalDetermination(actor, state, "Três Marcas de Morte.");
    else await actor.update(lifePatch(state), { naCsbAutomation: true, naLifeDeath: true });
  } else {
    await actor.update(lifePatch(state), { naCsbAutomation: true, naLifeDeath: true });
  }
  return { processed: true, natural };
}

async function reconcileActor(actor) {
  if (!isPrimaryGm() || !isSlayer(actor) || resolving.has(actor.id)) return;
  const props = actor.system.props;
  const state = parseLifeDeathState(props.vida_morte_slayer_dados);
  const pdv = slayerCurrentPdv(props);
  const damage = parseNumber(props.pdv_slayer_dano_tomado);
  const wound = parseNumber(props.pdv_slayer_dano_ferida);
  resolving.add(actor.id);
  try {
    if (pdv <= 0 && !state.dying && !state.dead) {
      state.fallsThisCombat = Math.min(4, state.fallsThisCombat + 1);
      state.dying = true; state.stabilized = false; state.deathMarks = Math.min(3, Math.max(0, state.fallsThisCombat - 1));
      if (state.fallsThisCombat >= 4) await markDead(actor, state, "Quarta queda no mesmo combate.");
      else await actor.update({ ...lifePatch(state), ...statusPatch(props, { add: ["derrubado"] }) }, { naCsbAutomation: true, naLifeDeath: true });
    } else if (pdv > 0 && state.dying) {
      await revive(actor, state, pdv, { exhaustion: 1, status: "desequilibrado", reason: "Cura recebida enquanto estava À Beira da Morte." });
    } else if (state.dying && (damage > state.lastDamage || wound > state.lastWound)) {
      state.stabilized = false;
      if (wound > state.lastWound) {
        await finalDetermination(actor, state, "Dano de Ferida recebido enquanto estava À Beira da Morte.");
      } else {
        state.deathMarks = Math.min(3, state.deathMarks + 1);
        if (state.deathMarks >= 3) await finalDetermination(actor, state, "Dano recebido enquanto estava À Beira da Morte.");
        else await actor.update(lifePatch(state), { naCsbAutomation: true, naLifeDeath: true });
      }
    }
    state.lastPdv = pdv; state.lastDamage = damage; state.lastWound = wound;
    if (!state.dead) await actor.update(lifePatch(state), { naCsbAutomation: true, naLifeDeath: true });
  } finally {
    resolving.delete(actor.id);
  }
}

async function resolveActor(actorUuid) {
  if (actorUuid) {
    const document = await fromUuid(actorUuid);
    const actor = document?.actor ?? document;
    if (actor?.system?.props) return actor;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

async function resolveActorUuid(actorUuid) {
  if (!actorUuid) return null;
  const document = await fromUuid(actorUuid);
  const actor = document?.actor ?? document;
  return actor?.system?.props ? actor : null;
}

export async function openLifeDeathManager({ actorUuid } = {}) {
  const actor = await resolveActor(actorUuid);
  if (!actor) return ui.notifications.warn("Não há personagem ativo.");
  const state = parseLifeDeathState(actor.system.props.vida_morte_slayer_dados);
  const canRoll = game.user.isGM && state.dying && !state.stabilized && !state.dead;
  const dyingTargets = [...(game.combat?.combatants ?? [])].map((entry) => entry.actor).filter((target) => {
    const targetState = parseLifeDeathState(target?.system?.props?.vida_morte_slayer_dados);
    return target && target.id !== actor.id && targetState.dying && !targetState.dead;
  });
  const targetOptions = dyingTargets.map((target) => `<option value="${target.uuid}">${target.name}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Vida e Morte — ${actor.name}` }, modal: true, rejectClose: false,
    content: `<div class="na-csb-automation" style="display:grid;gap:8px"><h3>${formatLifeDeathSummary(state)}</h3><div>PDV atual: <strong>${slayerCurrentPdv(actor.system.props)}</strong></div><div>Quedas no combate: <strong>${state.fallsThisCombat}</strong></div><p>O Teste de Morte acontece automaticamente no início do turno.</p>${dyingTargets.length ? `<fieldset><legend>Estabilizar aliado — Ação Única</legend><select name="target">${targetOptions}</select><select name="attr"><option value="INT">INT</option><option value="SAB">SAB</option></select></fieldset>` : ""}</div>`,
    buttons: [
      ...(canRoll ? [{ action: "roll", label: "Rolar Teste agora", callback: () => "roll" }] : []),
      ...(dyingTargets.length ? [{ action: "stabilize", label: "Estabilizar aliado", callback: (_event, _button, dialog) => ({ action: "stabilize", targetUuid: String(dialog.element.querySelector('[name="target"]')?.value ?? ""), attr: String(dialog.element.querySelector('[name="attr"]')?.value ?? "INT") }) }] : []),
      { action: "close", label: "Fechar", callback: () => null },
    ],
  });
  if (result === "roll") await processDeathTest(actor, { force: true });
  if (result?.action === "stabilize") {
    if (game.user.isGM) {
      const target = await resolveActorUuid(result.targetUuid);
      await stabilizeSlayer(actor, target, result.attr, { force: true });
    } else {
      game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, requesterId: game.user.id, helperUuid: actor.uuid, targetUuid: result.targetUuid, attr: result.attr });
      ui.notifications.info("Pedido de estabilização enviado ao GM.");
    }
  }
}

export async function stabilizeSlayer(helper, target, attr = "INT", { force = false } = {}) {
  if ((!force && !isPrimaryGm()) || !helper?.update || !target?.update) return { ok: false, reason: "invalid-context" };
  const targetState = parseLifeDeathState(target.system.props.vida_morte_slayer_dados);
  if (!targetState.dying || targetState.dead) return { ok: false, reason: "target-not-dying" };
  const action = await consumeSlayerActions(helper, "unica", { update: false });
  if (!action.ok) {
    ui.notifications.warn(action.reason);
    return action;
  }
  const attribute = String(attr).toUpperCase() === "SAB" ? "SAB" : "INT";
  const bonus = parseNumber(helper.system.props[`${attribute.toLowerCase()}_display`]);
  const roll = await Roll.create(`1d20 + ${bonus}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: helper }), flavor: `<strong>Estabilizar ${target.name}</strong> — ${attribute} CD 12` });
  const natural = roll.dice?.[0]?.results?.[0]?.result;
  if (natural === 1) targetState.deathMarks = Math.min(3, targetState.deathMarks + 1);
  const success = natural === 20 || roll.total >= 12;
  if (success) targetState.stabilized = true;
  if (natural === 20) targetState.deathMarks = Math.max(0, targetState.deathMarks - 1);
  await Promise.all([
    helper.update(action.patch ?? {}, { naCsbAutomation: true, naLifeDeath: true }),
    target.update(lifePatch(targetState), { naCsbAutomation: true, naLifeDeath: true }),
  ]);
  if (targetState.deathMarks >= 3) await finalDetermination(target, targetState, "Falha crítica ao tentar estabilizar.");
  return { ok: true, success, natural, total: roll.total, state: targetState };
}

async function processCurrentTurn(combat) {
  if (!isPrimaryGm() || !combat?.started) return;
  const actor = combat.combatant?.actor;
  if (!isSlayer(actor)) return;
  const key = `${combat.id}:${combat.round}:${combat.turn}:${combat.combatant.id}`;
  if (combat.getFlag(MODULE_ID, TURN_FLAG) === key) return;
  await combat.setFlag(MODULE_ID, TURN_FLAG, key);
  await processDeathTest(actor);
}

export function registerLifeDeathEngine() {
  game.socket.on(`module.${MODULE_ID}`, async (message) => {
    if (!isPrimaryGm() || message?.type !== SOCKET_TYPE) return;
    const requester = game.users.get(message.requesterId);
    const helper = await resolveActorUuid(message.helperUuid);
    const target = await resolveActorUuid(message.targetUuid);
    if (!requester || !helper?.testUserPermission?.(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
    await stabilizeSlayer(helper, target, message.attr, { force: true });
  });
  Hooks.on("updateActor", (actor, _changes, options) => {
    if (options?.naLifeDeath) return;
    void reconcileActor(actor);
  });
  Hooks.on("combatStart", (combat) => void processCurrentTurn(combat));
  Hooks.on("updateCombat", (combat, changes) => {
    if (Object.hasOwn(changes, "turn") || Object.hasOwn(changes, "round")) void processCurrentTurn(combat);
  });
  Hooks.on("combatEnd", (combat) => {
    if (!isPrimaryGm()) return;
    for (const combatant of combat.combatants ?? []) {
      const actor = combatant.actor;
      if (!isSlayer(actor)) continue;
      const state = parseLifeDeathState(actor.system.props.vida_morte_slayer_dados);
      state.fallsThisCombat = 0; state.finalDeterminationUsed = false; state.bondHelpUsed = false; state.combatId = "";
      void actor.update(lifePatch(state), { naCsbAutomation: true, naLifeDeath: true });
    }
  });
}
