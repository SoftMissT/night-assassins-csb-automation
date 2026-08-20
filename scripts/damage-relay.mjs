import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { applySlayerDamage } from "./status-engine.mjs";
import { addFlameEnemyHeat, FLAME_HEAT_FLAG } from "./flame-breathing-service.mjs";
import { parseStatusState } from "./status-service.mjs";
import { isSlayerActor } from "./actor-kind.mjs";

const SOCKET_NAME = `module.${MODULE_ID}`;
const DAMAGE_KEY = "pdv_oni_dano_tomado";
const WOUND_KEY = "pdv_oni_dano_ferida";
const REQUEST_TYPE = "applyOniDamage";
const RESPONSE_TYPE = "applyOniDamageResult";
const SLAYER_REQUEST_TYPE = "applySlayerDamage";
const SLAYER_RESPONSE_TYPE = "applySlayerDamageResult";
const REQUEST_TIMEOUT_MS = 60000;

const pendingRequests = new Map();

export const DAMAGE_TYPES = Object.freeze([
  ["cortante", "Cortante"], ["perfurante", "Perfurante"], ["concussao", "Concussão"],
  ["trovejante", "Trovejante"], ["sonoro", "Sonoro"], ["ferida", "Ferida"],
  ["sangramento", "Sangramento"], ["envenenamento", "Envenenamento"], ["necrotico", "Necrótico"],
  ["acido", "Ácido"], ["colapso", "Colapso"], ["congelante", "Congelante"],
  ["eletrico", "Elétrico"], ["fogo", "Fogo"], ["impacto", "Impacto"],
  ["mental", "Mental"], ["solar", "Solar"], ["venenoso", "Venenoso"],
]);

function normalizeDamageContext(context = {}) {
  const allowed = new Set(DAMAGE_TYPES.map(([key]) => key));
  const components = Array.isArray(context.components) ? context.components.slice(0, 12).map((component, index) => ({
    label: String(component?.label ?? `Dano ${index + 1}`).slice(0, 80),
    types: [...new Set(Array.isArray(component?.types) ? component.types.filter((key) => allowed.has(key)) : [])],
    subtotal: Math.max(0, Math.trunc(Number(component?.subtotal) || 0)),
  })) : [];
  return {
    attackName: String(context.attackName ?? "Dano").slice(0, 120),
    critical: context.critical === true,
    isAttack: context.isAttack !== false,
    isDemonic: context.isDemonic === true,
    rolledTotal: Math.max(0, Math.trunc(Number(context.rolledTotal) || 0)),
    damageTypes: [...new Set(Array.isArray(context.damageTypes) ? context.damageTypes.filter((key) => allowed.has(key)) : [])],
    components,
    requireApproval: context.requireApproval === true,
    ignoreResistance: context.ignoreResistance === true,
    flame: context.flame && typeof context.flame === "object" ? {
      sourceId: String(context.flame.sourceId ?? "").slice(0, 64),
      heat: Math.max(0, Math.min(5, Math.trunc(Number(context.flame.heat) || 0))),
      blockPenalty: Math.max(-10, Math.min(0, Math.trunc(Number(context.flame.blockPenalty) || 0))),
      blockPenaltyTurns: Math.max(0, Math.min(10, Math.trunc(Number(context.flame.blockPenaltyTurns) || 0))),
      exhaustionOnHit: Math.max(0, Math.min(2, Math.trunc(Number(context.flame.exhaustionOnHit) || 0))),
      exhaustionOverDamage: Math.max(0, Math.min(1000, Math.trunc(Number(context.flame.exhaustionOverDamage) || 0))),
    } : null,
  };
}

async function applyFlameAfterDamage(actor, context, appliedDamage) {
  const flame = context.flame;
  if (!flame?.sourceId || flame.heat < 1) return null;
  const heatMap = actor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
  const heat = addFlameEnemyHeat(heatMap, flame.sourceId, flame.heat);
  await actor.setFlag(MODULE_ID, FLAME_HEAT_FLAG, heat.state);

  const slayer = isSlayerActor(actor);
  const dataKey = slayer ? "status_slayer_dados" : "status_oni_dados";
  const exhaustionKey = slayer ? "status_slayer_exaustao" : "status_oni_exaustao";
  const props = actor.system?.props ?? {};
  const status = parseStatusState(props[dataKey]);
  const thresholdExhaustion = heat.thresholds.filter((value) => [5, 20, 40].includes(value)).length;
  const conditionalExhaustion = flame.exhaustionOnHit + (flame.exhaustionOverDamage > 0 && appliedDamage > flame.exhaustionOverDamage ? 1 : 0);
  const patch = {};
  if (thresholdExhaustion + conditionalExhaustion > 0) {
    status.exhaustion = Math.min(8, Math.max(status.exhaustion, Number(props[exhaustionKey]) || 0) + thresholdExhaustion + conditionalExhaustion);
    patch[`system.props.${exhaustionKey}`] = status.exhaustion;
  }
  if (heat.thresholds.includes(50)) {
    if (!status.active.includes("atordoamento")) status.active.push("atordoamento");
    status.effects.atordoamento = { remainingTurns: 2, tick: "end", sourceName: "Brasas Ardentes 50" };
  }
  if (thresholdExhaustion + conditionalExhaustion > 0 || heat.thresholds.includes(50)) patch[`system.props.${dataKey}`] = JSON.stringify(status);
  if (flame.blockPenalty < 0 && flame.blockPenaltyTurns > 0) {
    await actor.setFlag(MODULE_ID, "flameBlockPenalty", { value: flame.blockPenalty, turns: flame.blockPenaltyTurns });
  }
  if (Object.keys(patch).length) await actor.update(patch, { naCsbAutomation: true, naFlameHeat: true });
  for (const threshold of heat.thresholds.filter((value) => value === 10 || value === 30)) {
    if (slayer) await applySlayerDamage(actor, 5, { isAttack: false, source: `Brasas Ardentes ${threshold}` });
    else await updateOniDamage(actor, 5, 0);
  }
  return { heat: heat.heat, thresholds: heat.thresholds };
}

export function calculateApprovedDamage(amount, resisted = false) {
  const damage = Math.max(0, Math.trunc(Number(amount) || 0));
  return resisted ? Math.floor(damage / 2) : damage;
}

function activePrimaryGM() {
  return game.users
    ?.filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function splitDamage(amount, context, selectedTypes, resisted) {
  const hasComponents = context.components.length > 0;
  const woundRequested = hasComponents
    ? context.components.filter((component) => component.types.includes("ferida")).reduce((total, component) => total + component.subtotal, 0)
    : selectedTypes.includes("ferida") ? amount : 0;
  const boundedWound = selectedTypes.includes("ferida") ? Math.min(amount, woundRequested || (!hasComponents ? amount : 0)) : 0;
  const normalRequested = amount - boundedWound;
  return {
    normalDamage: calculateApprovedDamage(normalRequested, resisted),
    woundDamage: calculateApprovedDamage(boundedWound, resisted),
  };
}

async function updateOniDamage(actor, normalDamage, woundDamage = 0) {
  const current = parseNumber(actor.system?.props?.[DAMAGE_KEY]);
  const currentWounds = parseNumber(actor.system?.props?.[WOUND_KEY]);
  const total = current + normalDamage;
  const woundTotal = currentWounds + woundDamage;
  const patch = { [`system.props.${DAMAGE_KEY}`]: total };
  if (woundDamage > 0) patch[`system.props.${WOUND_KEY}`] = woundTotal;
  await actor.update(patch, { naCsbAutomation: true });
  return { total, woundTotal };
}

function emitResult(recipientId, requestId, result) {
  game.socket.emit(SOCKET_NAME, {
    type: RESPONSE_TYPE,
    recipientId,
    requestId,
    ...result,
  });
}

function emitSlayerResult(recipientId, requestId, result) {
  game.socket.emit(SOCKET_NAME, {
    type: SLAYER_RESPONSE_TYPE,
    recipientId,
    requestId,
    ...result,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function requestDamageApproval(actor, requester, amount, currentDamage, rawContext = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const context = normalizeDamageContext(rawContext);
  const typeOptions = DAMAGE_TYPES.map(([key, label]) => {
    const checked = context.damageTypes.includes(key) ? "checked" : "";
    return `<label class="na-relay-type"><input type="checkbox" name="damageType" value="${key}" ${checked}><span>${label}</span></label>`;
  }).join("");
  const typeLabels = new Map(DAMAGE_TYPES);
  const componentRows = context.components.length > 0
    ? context.components.map((component) => `<tr><td>${escapeHtml(component.label)}</td><td>${escapeHtml(component.types.map((key) => typeLabels.get(key) ?? key).join(" · ") || "Sem tipo")}</td><td style="text-align:right"><strong>${component.subtotal}</strong></td></tr>`).join("")
    : `<tr><td>Dano</td><td>${escapeHtml(context.damageTypes.map((key) => typeLabels.get(key) ?? key).join(" · ") || "Sem tipo")}</td><td style="text-align:right"><strong>${amount}</strong></td></tr>`;
  const resistanceControl = context.ignoreResistance
    ? `<div class="form-group"><label>Resistência</label><div class="form-fields"><strong>Ignorada pela técnica</strong></div></div>`
    : `<div class="form-group"><label>Resistência</label><div class="form-fields"><select name="damageResistance"><option value="normal">Sem resistência</option><option value="resisted">Resistente · metade</option></select></div></div>`;

  return DialogV2.wait({
    window: { title: "Autorizar dano no inimigo" },
    position: { width: 680, height: "auto" },
    modal: true,
    rejectClose: false,
    content: `
      <fieldset>
        <legend>Pedido de dano</legend>
        <div class="form-group"><label>Jogador</label><div class="form-fields"><strong>${escapeHtml(requester.name)}</strong></div></div>
        <div class="form-group"><label>Alvo</label><div class="form-fields"><strong>${escapeHtml(actor.name)}</strong></div></div>
        <div class="form-group"><label>Ataque</label><div class="form-fields"><strong>${escapeHtml(context.attackName)}</strong></div></div>
        <div class="form-group"><label>Dano atual</label><div class="form-fields"><span>${currentDamage}</span></div></div>
        <div class="form-group"><label>Dano solicitado</label><div class="form-fields"><strong>${amount}</strong>${context.critical ? `<span class="tag">Crítico · base ${context.rolledTotal}</span>` : ""}</div></div>
        <table style="width:100%;margin-top:8px"><thead><tr><th style="text-align:left">Parte</th><th style="text-align:left">Tipo</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${componentRows}</tbody></table>
      </fieldset>
      <fieldset>
        <legend>Resolução</legend>
        ${resistanceControl}
        <label>Tipo(s) de dano</label>
        <div class="na-relay-types" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:6px;">${typeOptions}</div>
      </fieldset>
      <p class="hint">${context.ignoreResistance ? "Esta técnica ignora resistência." : "O crítico já está incluído no dano solicitado. A resistência é aplicada depois dele."}</p>`,
    buttons: [
      {
        action: "deny",
        label: "Recusar",
        callback: () => ({ approved: false }),
      },
      {
        action: "approve",
        label: "Autorizar e aplicar",
        default: true,
        callback: (_event, _button, dialog) => {
          const root = dialog.element;
          const resisted = context.ignoreResistance ? false : root.querySelector('[name="damageResistance"]')?.value === "resisted";
          const damageTypes = [...root.querySelectorAll('[name="damageType"]:checked')].map((input) => input.value);
          const breakdown = splitDamage(amount, context, damageTypes, resisted);
          const appliedDamage = breakdown.normalDamage + breakdown.woundDamage;
          return {
            approved: true,
            resisted,
            damageTypes,
            appliedDamage,
            ...breakdown,
            projectedTotal: currentDamage + appliedDamage,
          };
        },
      },
    ],
  });
}

async function handleDamageRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;

  const requester = game.users.get(message.requesterId);
  const amount = Math.trunc(Number(message.amount));
  if (!requester?.active || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) {
    emitResult(message.requesterId, message.requestId, { ok: false, error: "Pedido de dano inválido." });
    return;
  }

  const document = await fromUuid(message.actorUuid);
  const actor = document?.actor ?? document;
  if (!actor || actor.documentName !== "Actor") {
    emitResult(message.requesterId, message.requestId, { ok: false, error: "Actor alvo não encontrado." });
    return;
  }

  try {
    const currentDamage = parseNumber(actor.system?.props?.[DAMAGE_KEY]);
    const context = normalizeDamageContext(message.context);
    const approval = await requestDamageApproval(actor, requester, amount, currentDamage, context);
    if (!approval?.approved) {
      emitResult(message.requesterId, message.requestId, {
        ok: false,
        error: `O GM recusou o pedido de ${amount} de dano em ${actor.name}.`,
      });
      return;
    }

    const { total, woundTotal } = await updateOniDamage(actor, approval.normalDamage, approval.woundDamage);
    const flame = await applyFlameAfterDamage(actor, context, approval.appliedDamage);
    emitResult(message.requesterId, message.requestId, {
      ok: true,
      total,
      actorName: actor.name,
      appliedDamage: approval.appliedDamage,
      normalDamage: approval.normalDamage,
      woundDamage: approval.woundDamage,
      woundTotal,
      resisted: approval.resisted,
      damageTypes: approval.damageTypes,
      flame,
    });
  } catch (error) {
    emitResult(message.requesterId, message.requestId, { ok: false, error: error?.message || "Falha ao atualizar o Oni." });
  }
}

async function handleSlayerDamageRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;
  const requester = game.users.get(message.requesterId);
  const amount = Math.trunc(Number(message.amount));
  if (!requester?.active || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) {
    emitSlayerResult(message.requesterId, message.requestId, { ok: false, error: "Pedido de dano inválido." });
    return;
  }
  const document = await fromUuid(message.actorUuid);
  const actor = document?.actor ?? document;
  if (!actor || actor.documentName !== "Actor") {
    emitSlayerResult(message.requesterId, message.requestId, { ok: false, error: "Slayer alvo não encontrado." });
    return;
  }
  try {
    const context = normalizeDamageContext(message.context);
    const result = await applySlayerDamage(actor, amount, context);
    const flame = await applyFlameAfterDamage(actor, context, result.appliedDamage ?? result.totalDamage ?? amount);
    emitSlayerResult(message.requesterId, message.requestId, { ok: true, ...result, flame });
  } catch (error) {
    emitSlayerResult(message.requesterId, message.requestId, { ok: false, error: error?.message || "Falha ao atualizar o Slayer." });
  }
}

function handleDamageResponse(message) {
  if (message.recipientId !== game.user.id) return;
  const pending = pendingRequests.get(message.requestId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(message.requestId);
  message.ok ? pending.resolve(message) : pending.reject(new Error(message.error));
}

export function registerDamageRelay() {
  game.socket.on(SOCKET_NAME, (message = {}) => {
    if (message.type === REQUEST_TYPE) void handleDamageRequest(message);
    if (message.type === SLAYER_REQUEST_TYPE) void handleSlayerDamageRequest(message);
    if (message.type === RESPONSE_TYPE || message.type === SLAYER_RESPONSE_TYPE) handleDamageResponse(message);
  });
}

export async function applySlayerDamageAuto(actor, amount, rawContext = {}) {
  const damage = Math.trunc(Number(amount));
  const context = normalizeDamageContext(rawContext);
  if (!actor || !Number.isSafeInteger(damage) || damage <= 0) throw new Error("Slayer alvo ou dano inválido.");
  if (game.user.isGM || actor.isOwner) {
    const result = await applySlayerDamage(actor, damage, context);
    const flame = await applyFlameAfterDamage(actor, context, result.appliedDamage ?? result.totalDamage ?? damage);
    return { ...result, flame };
  }

  const gm = activePrimaryGM();
  if (!gm) throw new Error("Nenhum GM ativo para aplicar o dano no Slayer.");
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("O GM não respondeu ao dano do Slayer."));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timeoutId });
    game.socket.emit(SOCKET_NAME, {
      type: SLAYER_REQUEST_TYPE,
      requestId,
      requesterId: game.user.id,
      gmId: gm.id,
      actorUuid: actor.uuid,
      amount: damage,
      context,
    });
  });
}

export async function applyOniDamage(actor, amount, rawContext = {}) {
  const damage = Math.trunc(Number(amount));
  const context = normalizeDamageContext(rawContext);
  if (!actor || !Number.isSafeInteger(damage) || damage <= 0) {
    throw new Error("Actor alvo ou dano inválido.");
  }

  if ((game.user.isGM || actor.isOwner) && !(context.requireApproval && !game.user.isGM)) {
    let breakdown = splitDamage(damage, context, context.damageTypes, false);
    let appliedDamage = breakdown.normalDamage + breakdown.woundDamage;
    let resolution = { resisted: false, damageTypes: context.damageTypes };
    if (context.requireApproval && game.user.isGM) {
      const currentDamage = parseNumber(actor.system?.props?.[DAMAGE_KEY]);
      const approval = await requestDamageApproval(actor, game.user, damage, currentDamage, context);
      if (!approval?.approved) throw new Error(`O dano em ${actor.name} foi cancelado.`);
      appliedDamage = approval.appliedDamage;
      breakdown = { normalDamage: approval.normalDamage, woundDamage: approval.woundDamage };
      resolution = approval;
    }
    const { total, woundTotal } = await updateOniDamage(actor, breakdown.normalDamage, breakdown.woundDamage);
    const flame = await applyFlameAfterDamage(actor, context, appliedDamage);
    return {
      ok: true,
      total,
      woundTotal,
      actorName: actor.name,
      appliedDamage,
      ...breakdown,
      resisted: resolution.resisted,
      damageTypes: resolution.damageTypes,
      flame,
    };
  }

  const gm = activePrimaryGM();
  if (!gm) throw new Error("Nenhum GM ativo para aplicar o dano no Oni.");

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("O GM não respondeu ao pedido de dano."));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timeoutId });
    game.socket.emit(SOCKET_NAME, {
      type: REQUEST_TYPE,
      requestId,
      requesterId: game.user.id,
      gmId: gm.id,
      actorUuid: actor.uuid,
      amount: damage,
      context,
    });
  });
}

export const DAMAGE_RELAY_KEY = DAMAGE_KEY;
export const WOUND_DAMAGE_KEY = WOUND_KEY;
