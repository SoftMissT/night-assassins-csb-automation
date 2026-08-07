import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";

const SOCKET_NAME = `module.${MODULE_ID}`;
const DAMAGE_KEY = "pdv_oni_dano_tomado";
const REQUEST_TYPE = "applyOniDamage";
const RESPONSE_TYPE = "applyOniDamageResult";
const REQUEST_TIMEOUT_MS = 60000;

const pendingRequests = new Map();

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

export async function requestDamageApproval(actor, requester, amount, currentDamage) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const projectedTotal = currentDamage + amount;

  return DialogV2.wait({
    window: { title: "Autorizar dano no inimigo" },
    position: { width: 520, height: "auto" },
    modal: true,
    rejectClose: false,
    content: `
      <fieldset>
        <legend>Pedido de dano</legend>
        <div class="form-group"><label>Jogador</label><div class="form-fields"><strong>${escapeHtml(requester.name)}</strong></div></div>
        <div class="form-group"><label>Alvo</label><div class="form-fields"><strong>${escapeHtml(actor.name)}</strong></div></div>
        <div class="form-group"><label>Dano atual</label><div class="form-fields"><span>${currentDamage}</span></div></div>
        <div class="form-group"><label>Dano solicitado</label><div class="form-fields"><strong>${amount}</strong></div></div>
        <div class="form-group"><label>Total após aplicar</label><div class="form-fields"><strong>${projectedTotal}</strong></div></div>
      </fieldset>
      <p class="hint">Autorize somente se o resultado da rolagem estiver correto.</p>`,
    buttons: [
      {
        action: "deny",
        label: "Recusar",
        icon: "<i class='fa-solid fa-xmark'></i>",
        callback: () => false,
      },
      {
        action: "approve",
        label: "Autorizar e aplicar",
        icon: "<i class='fa-solid fa-check'></i>",
        default: true,
        callback: () => true,
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
    const approved = await requestDamageApproval(actor, requester, amount, currentDamage);
    if (!approved) {
      emitResult(message.requesterId, message.requestId, {
        ok: false,
        error: `O GM recusou o pedido de ${amount} de dano em ${actor.name}.`,
      });
      return;
    }

    const total = await updateOniDamage(actor, amount);
    emitResult(message.requesterId, message.requestId, { ok: true, total, actorName: actor.name });
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

export async function applyOniDamage(actor, amount) {
  const damage = Math.trunc(Number(amount));
  if (!actor || !Number.isSafeInteger(damage) || damage <= 0) {
    throw new Error("Actor alvo ou dano inválido.");
  }

  if (game.user.isGM || actor.isOwner) {
    return { ok: true, total: await updateOniDamage(actor, damage), actorName: actor.name };
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
    });
  });
}

export const DAMAGE_RELAY_KEY = DAMAGE_KEY;
