/**
 * @fileoverview Relay de cura genérico entre atores — espelha a arquitetura
 * de damage-relay.mjs. Reaproveita os campos "curado" que já existem em
 * todos os quatro templates de Actor (Slayer, Oni, Oni Minion, NPC); esta
 * automação só decide QUEM escreve neles e QUANDO (ownership direto vs.
 * pedido de aprovação a um GM ativo via socket), sem criar campos novos.
 *
 * O canal de socket é o MESMO usado por damage-relay.mjs (`module.${MODULE_ID}`)
 * — apenas dois tipos de mensagem irmãos (`applyHeal` / `applyHealResult`)
 * foram adicionados ao roteamento existente, sem abrir um canal paralelo.
 */
import { MODULE_ID } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { actorKind } from "./actor-kind.mjs";

const SOCKET_NAME = `module.${MODULE_ID}`;
const HEAL_REQUEST_TYPE = "applyHeal";
const HEAL_RESPONSE_TYPE = "applyHealResult";
const REQUEST_TIMEOUT_MS = 60000;

const pendingHealRequests = new Map();

function activePrimaryGM() {
  return game.users
    ?.filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

/**
 * Resolve o campo de cura ("curado") correto por tipo de ator. Os quatro
 * campos abaixo já existem nos templates e já somam no cálculo de PDV
 * atual — esta função só localiza qual chave usar, nunca cria uma nova.
 * @param {Actor} actor
 * @returns {{heal: string}}
 */
export function healKeysFor(actor) {
  const kind = actorKind(actor);
  if (kind === "oni_minion") return { heal: "oni_minion_pdv_curado" };
  if (kind === "oni") return { heal: "pdv_oni_curado" };
  if (kind === "npc") return { heal: "npc_pdv_curado" };
  return { heal: "pdv_slayer_curado" };
}

async function updateActorHeal(actor, amount) {
  const keys = healKeysFor(actor);
  const current = parseNumber(actor.system?.props?.[keys.heal]);
  const total = current + amount;
  await actor.update({ [`system.props.${keys.heal}`]: total }, { naCsbAutomation: true });
  return { total, key: keys.heal };
}

function emitHealResult(recipientId, requestId, result) {
  game.socket.emit(SOCKET_NAME, {
    type: HEAL_RESPONSE_TYPE,
    recipientId,
    requestId,
    ...result,
  });
}

async function handleHealRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;
  const requester = game.users.get(message.requesterId);
  const amount = Math.trunc(Number(message.amount));
  if (!requester?.active || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) {
    emitHealResult(message.requesterId, message.requestId, { ok: false, error: "Pedido de cura inválido." });
    return;
  }
  const document = await fromUuid(message.actorUuid);
  const actor = document?.actor ?? document;
  if (!actor || actor.documentName !== "Actor") {
    emitHealResult(message.requesterId, message.requestId, { ok: false, error: "Actor alvo não encontrado." });
    return;
  }
  try {
    const { total, key } = await updateActorHeal(actor, amount);
    emitHealResult(message.requesterId, message.requestId, { ok: true, total, key, actorName: actor.name, appliedHeal: amount });
  } catch (error) {
    emitHealResult(message.requesterId, message.requestId, { ok: false, error: error?.message || "Falha ao aplicar cura." });
  }
}

function handleHealResponse(message) {
  if (message.recipientId !== game.user.id) return;
  const pending = pendingHealRequests.get(message.requestId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingHealRequests.delete(message.requestId);
  message.ok ? pending.resolve(message) : pending.reject(new Error(message.error));
}

/**
 * Registra o roteamento de mensagens de cura no MESMO canal de socket do
 * relay de dano. Chamar uma vez, junto de registerDamageRelay().
 */
export function registerHealRelay() {
  game.socket.on(SOCKET_NAME, (message = {}) => {
    if (message.type === HEAL_REQUEST_TYPE) void handleHealRequest(message);
    if (message.type === HEAL_RESPONSE_TYPE) handleHealResponse(message);
  });
}

/**
 * Aplica `amount` de cura ao campo "curado" do alvo resolvido por
 * healKeysFor. Mesma lógica de ownership/aprovação usada no dano: dono do
 * alvo ou GM aplica direto; qualquer outro jogador dispara um pedido via
 * socket para um GM ativo aprovar. Idempotente por chamada — cada chamada
 * soma exatamente `amount` uma única vez (sem duplo-clique: o chamador não
 * deve invocar duas vezes para o mesmo evento de cura).
 * @param {Actor} targetActor
 * @param {number} amount
 * @param {object} [context] - reservado para uso futuro (paridade com applyOniDamage/applySlayerDamageAuto).
 * @returns {Promise<{ok:boolean, total:number, key:string, actorName:string, appliedHeal:number}>}
 */
export async function applyHealTo(targetActor, amount, _context = {}) {
  const heal = Math.trunc(Number(amount));
  if (!targetActor || !Number.isSafeInteger(heal) || heal <= 0) {
    throw new Error("Actor alvo ou valor de cura inválido.");
  }

  if (game.user.isGM || targetActor.isOwner) {
    const { total, key } = await updateActorHeal(targetActor, heal);
    return { ok: true, total, key, actorName: targetActor.name, appliedHeal: heal };
  }

  const gm = activePrimaryGM();
  if (!gm) throw new Error("Nenhum GM ativo para aplicar a cura.");

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingHealRequests.delete(requestId);
      reject(new Error("O GM não respondeu ao pedido de cura."));
    }, REQUEST_TIMEOUT_MS);
    pendingHealRequests.set(requestId, { resolve, reject, timeoutId });
    game.socket.emit(SOCKET_NAME, {
      type: HEAL_REQUEST_TYPE,
      requestId,
      requesterId: game.user.id,
      gmId: gm.id,
      actorUuid: targetActor.uuid,
      amount: heal,
    });
  });
}

/**
 * API pública chamada pelo fluxo de Dano quando o modal "Dano ou Cura?"
 * escolhe Cura: aplica a MESMA quantidade que seria dano, como cura.
 * @param {Actor} targetActor
 * @param {number} amount
 * @param {object} [context]
 */
export async function healActor(targetActor, amount, context = {}) {
  return applyHealTo(targetActor, amount, context);
}
