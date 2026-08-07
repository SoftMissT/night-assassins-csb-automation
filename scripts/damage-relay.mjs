import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";

const SOCKET_NAME = `module.${MODULE_ID}`;
const DAMAGE_KEY = "pdv_oni_dano_tomado";
const REQUEST_TYPE = "applyOniDamage";
const RESPONSE_TYPE = "applyOniDamageResult";
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
  return {
    attackName: String(context.attackName ?? "Dano").slice(0, 120),
    critical: context.critical === true,
    rolledTotal: Math.max(0, Math.trunc(Number(context.rolledTotal) || 0)),
    damageTypes: [...new Set(Array.isArray(context.damageTypes) ? context.damageTypes.filter((key) => allowed.has(key)) : [])],
    requireApproval: context.requireApproval === true,
  };
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

async function updateOniDamage(actor, amount) {
  const current = parseNumber(actor.system?.props?.[DAMAGE_KEY]);
  const total = current + amount;
  await actor.update({ [`system.props.${DAMAGE_KEY}`]: total }, { naCsbAutomation: true });
  return total;
}

function emitResult(recipientId, requestId, result) {
  game.socket.emit(SOCKET_NAME, {
    type: RESPONSE_TYPE,
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
      </fieldset>
      <fieldset>
        <legend>Resolução</legend>
        <div class="form-group"><label>Resistência</label><div class="form-fields"><select name="damageResistance"><option value="normal">Sem resistência</option><option value="resisted">Resistente · metade</option></select></div></div>
        <label>Tipo(s) de dano</label>
        <div class="na-relay-types" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:6px;">${typeOptions}</div>
      </fieldset>
      <p class="hint">O crítico já está incluído no dano solicitado. A resistência é aplicada depois dele.</p>`,
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
          const resisted = root.querySelector('[name="damageResistance"]')?.value === "resisted";
          const damageTypes = [...root.querySelectorAll('[name="damageType"]:checked')].map((input) => input.value);
          const appliedDamage = calculateApprovedDamage(amount, resisted);
          return {
            approved: true,
            resisted,
            damageTypes,
            appliedDamage,
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

    const total = await updateOniDamage(actor, approval.appliedDamage);
    emitResult(message.requesterId, message.requestId, {
      ok: true,
      total,
      actorName: actor.name,
      appliedDamage: approval.appliedDamage,
      resisted: approval.resisted,
      damageTypes: approval.damageTypes,
    });
  } catch (error) {
    emitResult(message.requesterId, message.requestId, { ok: false, error: error?.message || "Falha ao atualizar o Oni." });
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
    if (message.type === RESPONSE_TYPE) handleDamageResponse(message);
  });
}

export async function applyOniDamage(actor, amount, rawContext = {}) {
  const damage = Math.trunc(Number(amount));
  const context = normalizeDamageContext(rawContext);
  if (!actor || !Number.isSafeInteger(damage) || damage <= 0) {
    throw new Error("Actor alvo ou dano inválido.");
  }

  if ((game.user.isGM || actor.isOwner) && !(context.requireApproval && !game.user.isGM)) {
    let appliedDamage = damage;
    let resolution = { resisted: false, damageTypes: context.damageTypes };
    if (context.requireApproval && game.user.isGM) {
      const currentDamage = parseNumber(actor.system?.props?.[DAMAGE_KEY]);
      const approval = await requestDamageApproval(actor, game.user, damage, currentDamage, context);
      if (!approval?.approved) throw new Error(`O dano em ${actor.name} foi cancelado.`);
      appliedDamage = approval.appliedDamage;
      resolution = approval;
    }
    return {
      ok: true,
      total: await updateOniDamage(actor, appliedDamage),
      actorName: actor.name,
      appliedDamage,
      resisted: resolution.resisted,
      damageTypes: resolution.damageTypes,
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
