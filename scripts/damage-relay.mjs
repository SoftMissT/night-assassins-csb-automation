import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";

const SOCKET_NAME = `module.${MODULE_ID}`;
const DAMAGE_KEY = "pdv_oni_dano_tomado";
const REQUEST_TYPE = "applyOniDamage";
const RESPONSE_TYPE = "applyOniDamageResult";
const REQUEST_TIMEOUT_MS = 8000;

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
