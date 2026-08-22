/**
 * @fileoverview Motor GM-authoritativo de Vida e Morte dos Slayers.
 */

import { MODULE_ID } from "./constants.mjs";
import { parseNumber, parseLevel } from "./parsing.mjs";
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

export function slayerMaxPdv(props = {}) {
  return Math.max(0, parseNumber(props.pdv_slayer_total_conta) - parseNumber(props.pdv_slayer_dano_ferida) + parseNumber(props.pdv_slayer_extra));
}

export function slayerCurrentPdv(props = {}) {
  return Math.max(0, slayerMaxPdv(props) + parseNumber(props.pdv_slayer_curado) - parseNumber(props.pdv_slayer_dano_tomado));
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

function statusPatch(props, { add = [], remove = [], exhaustion = 0, blockReaction = false } = {}) {
  const status = parseStatusState(props.status_slayer_dados);
  const active = new Set(status.active);
  for (const key of remove) { active.delete(key); delete status.effects[key]; }
  for (const key of add) active.add(key);
  if (blockReaction) active.add("sem_reacao");
  status.active = [...active];
  status.exhaustion = Math.min(8, Math.max(status.exhaustion, Number(props.status_slayer_exaustao) || 0) + exhaustion);
  for (const key of add) {
    if (key === "desorientado") {
      status.effects[key] = { damageFormula: "", remainingTurns: 1, sourceName: "Vida e Morte", saveAttr: "", saveDc: 0, stacks: 1, tick: "end" };
    } else if (key === "desequilibrado" || key === "sem_reacao") {
      status.effects[key] = { damageFormula: "", remainingTurns: 1, sourceName: "Vida e Morte", saveAttr: "", saveDc: 0, stacks: 1, tick: "start" };
    }
  }
  if (blockReaction) {
    status.effects.sem_reacao = status.effects.sem_reacao ?? { damageFormula: "", remainingTurns: 1, sourceName: "Vida e Morte", saveAttr: "", saveDc: 0, stacks: 1, tick: "start" };
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

async function revive(actor, state, pdv, { exhaustion = 1, status = null, blockReaction = false, reason = "" } = {}) {
  const props = actor.system.props;
  state.dying = false; state.stabilized = false; state.dead = false; state.deathMarks = 0; state.lastPdv = pdv;
  const remove = ["derrubado", ...(blockReaction ? [] : ["sem_reacao"])];
  await actor.update({
    ...lifePatch(state),
    ...statusPatch(props, { add: status ? [status] : [], remove, exhaustion, blockReaction }),
    "system.props.pdv_slayer_dano_tomado": damageForCurrent(props, pdv),
  }, { naCsbAutomation: true, naLifeDeath: true });
  const name = escapeHtml(actor.name);
  const safeReason = reason ? escapeHtml(reason) : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<strong>${name} voltou com ${pdv} PDV.</strong>${safeReason ? `<br>${safeReason}` : ""}` });
}

async function finalDetermination(actor, state, reason) {
  if (state.finalDeterminationUsed) return markDead(actor, state, `${reason}<br>Determinação Final já utilizada neste combate.`);
  const bondDisabled = state.bondHelpUsed ? " disabled" : "";
  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: `Determinação Final — ${actor.name}` }, modal: true, rejectClose: false,
    content: `<div class="na-csb-automation" style="display:grid;gap:9px"><p><strong>${reason}</strong></p><label>Motivo Forte<textarea name="motive" rows="3"></textarea></label><label>CD<select name="dc"><option value="15">15 — perigo comum</option><option value="18" selected>18 — Oni importante/crítico</option><option value="20">20 — chefe/morte dramática</option><option value="custom">Customizada pelo Mestre</option></select></label><label>CD personalizada<input type="number" name="customDc" min="1" max="99" placeholder="CD do Mestre"></label><label><input type="checkbox" name="bond"${bondDisabled}> Ajuda de Vínculo (+2)${state.bondHelpUsed ? " · já utilizada neste combate" : ""}</label></div>`,
    buttons: [
      { action: "roll", label: "Tentar Determinação", callback: (_event, _button, dialog) => {
        const dcSelect = String(dialog.element.querySelector('[name="dc"]')?.value ?? "18");
        const customDc = Number(dialog.element.querySelector('[name="customDc"]')?.value || 0);
        const dc = dcSelect === "custom" ? (customDc >= 1 ? customDc : 18) : Number(dcSelect);
        return { motive: String(dialog.element.querySelector('[name="motive"]')?.value ?? "").trim(), dc, bond: Boolean(dialog.element.querySelector('[name="bond"]')?.checked) };
      } },
      { action: "die", label: "Aceitar a morte", callback: () => null },
    ],
  });
  if (decision === null || decision === undefined) return markDead(actor, state, `${reason}<br>A morte foi aceita.`);
  if (!decision.motive) return markDead(actor, state, `${reason}<br>Nenhum Motivo Forte foi declarado.`);
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
    return revive(actor, state, Math.max(1, recovery.total + parseNumber(actor.system.props.vit_display)), { exhaustion: 1, status: null, reason: "20 natural na Determinação Final." });
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
    await revive(actor, state, Math.max(1, recovery.total + parseNumber(actor.system.props.vit_display)), { exhaustion: 1, status: null, reason: "1 natural no Teste de Morte." });
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

async function confirmDirectDeath(actor, state, reason) {
  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: `Morte sem Teste — ${actor.name}` }, modal: true, rejectClose: false,
    content: `<div class="na-csb-automation" style="display:grid;gap:9px"><p><strong>${escapeHtml(reason)}</strong></p><p>Regra 11 — Mortes sem Teste. O Mestre decide se existe corpo, alma e cena para a Determinação Final.</p></div>`,
    buttons: [
      { action: "die", label: "Declarar morte", callback: () => ({ action: "die", reason }) },
      { action: "determination", label: "Permitir Determinação Final", callback: () => ({ action: "determination", reason }) },
      { action: "fall", label: "Cancelar (queda comum)", callback: () => ({ action: "fall" }) },
    ],
  });
  return decision ?? { action: "fall" };
}

export async function reconcileActor(actor, options = {}) {
  if (!isPrimaryGm() || !isSlayer(actor) || resolving.has(actor.id)) return;
  const props = actor.system.props;
  const level = parseLevel(props.nvl_pj);
  if (level < 1) return;
  const state = parseLifeDeathState(props.vida_morte_slayer_dados);
  const maximum = slayerMaxPdv(props);
  const pdv = slayerCurrentPdv(props);
  const damage = parseNumber(props.pdv_slayer_dano_tomado);
  const wound = parseNumber(props.pdv_slayer_dano_ferida);
  resolving.add(actor.id);
  try {
    if (!state.dead && parseNumber(props.status_slayer_exaustao) >= 8) {
      await markDead(actor, state, "Exaustão Nível 8 — morte sem Teste.");
    } else if (pdv <= 0 && !state.dying && !state.dead) {
      const decision = maximum <= 0
        ? await confirmDirectDeath(actor, state, "Dano de Ferida reduziu o PDV máximo a 0.")
        : { action: "fall" };
      if (decision.action === "die") {
        await markDead(actor, state, decision.reason);
      } else if (decision.action === "determination") {
        await finalDetermination(actor, state, decision.reason);
      } else {
        state.fallsThisCombat = Math.min(4, state.fallsThisCombat + 1);
        state.dying = true; state.stabilized = false; state.deathMarks = Math.min(3, Math.max(0, state.fallsThisCombat - 1));
        if (state.fallsThisCombat >= 4) await markDead(actor, state, "Quarta queda no mesmo combate.");
        else await actor.update({ ...lifePatch(state), ...statusPatch(props, { add: ["derrubado"] }) }, { naCsbAutomation: true, naLifeDeath: true });
      }
    } else if (pdv > 0 && state.dying) {
      await revive(actor, state, pdv, { exhaustion: 1, status: "desequilibrado", blockReaction: true, reason: "Cura recebida enquanto estava À Beira da Morte." });
    } else if (state.dying && (damage > state.lastDamage || wound > state.lastWound)) {
      state.stabilized = false;
      if (options?.naCritical === true || wound > state.lastWound) {
        await finalDetermination(actor, state, wound > state.lastWound
          ? "Dano de Ferida recebido enquanto estava À Beira da Morte."
          : "Dano crítico recebido enquanto estava À Beira da Morte.");
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
    content: `<div class="na-csb-automation" style="display:grid;gap:8px"><h3>${formatLifeDeathSummary(state)}</h3><div>PDV atual: <strong>${slayerCurrentPdv(actor.system.props)}</strong></div><div>Quedas no combate: <strong>${state.fallsThisCombat}</strong></div>${state.finalDeterminationUsed ? "<p>Determinação Final já utilizada neste combate.</p>" : ""}${state.bondHelpUsed ? "<p>Ajuda de Vínculo já utilizada neste combate.</p>" : ""}<p>O Teste de Morte acontece automaticamente no início do turno.</p>${dyingTargets.length ? `<fieldset><legend>Estabilizar aliado — Ação Única</legend><select name="target">${targetOptions}</select><select name="attr"><option value="INT">INT</option><option value="SAB">SAB</option></select></fieldset>` : ""}</div>`,
    buttons: [
      ...(canRoll ? [{ action: "roll", label: "Rolar Teste agora", callback: () => "roll" }] : []),
      ...(dyingTargets.length ? [{ action: "stabilize", label: "Estabilizar aliado", callback: (_event, _button, dialog) => ({ action: "stabilize", targetUuid: String(dialog.element.querySelector('[name="target"]')?.value ?? ""), attr: String(dialog.element.querySelector('[name="attr"]')?.value ?? "INT") }) }] : []),
      ...(game.user.isGM ? [{ action: "kill", label: "Declarar morte (sem Teste)", callback: () => "kill" }] : []),
      { action: "close", label: "Fechar", callback: () => null },
    ],
  });
  if (result === "roll") await processDeathTest(actor, { force: true });
  if (result === "kill") await openDirectDeath(actor, state);
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

async function openDirectDeath(actor, state) {
  if (!game.user.isGM) return;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Morte direta — ${actor.name}` }, modal: true, rejectClose: false,
    content: `<div class="na-csb-automation" style="display:grid;gap:9px"><p>Regra 11 — Mortes sem Teste: decapitação completa, corpo destruído, coração arrancado, Dano de Ferida que zere o PDV máximo, Exaustão Nível 8, Maldição Final da Marca do Caçador ou regra específica.</p><label>Causa / cena<textarea name="reason" rows="3" placeholder="Decapitação, execução, corpo destruído..."></textarea></label><label><input type="checkbox" name="allowDf"> Permitir Determinação Final (Mestre considera que existe corpo, alma e cena)</label></div>`,
    buttons: [
      { action: "die", label: "Declarar morte", default: true, callback: (_event, _button, dialog) => ({ allowDf: Boolean(dialog.element.querySelector('[name="allowDf"]')?.checked), reason: String(dialog.element.querySelector('[name="reason"]')?.value ?? "").trim() }) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (!result) return;
  const reason = result.reason || "Morte direta declarada pelo Mestre.";
  if (result.allowDf) await finalDetermination(actor, state, reason);
  else await markDead(actor, state, reason);
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
    void reconcileActor(actor, options);
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
