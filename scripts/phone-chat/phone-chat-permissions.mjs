/**
 * @fileoverview Permissões puras do HUD Telefone/Chat (Specs §5).
 *
 * Sem DOM, sem socket, sem persistência. A autorização é aplicada no cliente
 * GM e novamente na montagem do sync; ocultar botão não é autorização.
 */

/**
 * @param {string} userId
 * @param {object} conversation
 * @returns {boolean}
 */
export function isParticipant(userId, conversation) {
  if (!conversation || typeof userId !== "string") return false;
  return conversation.participantUserIds.includes(userId);
}

/**
 * @param {{id: string, isGM: boolean}} user
 * @param {object} conversation
 * @returns {boolean}
 */
export function canReadConversation(user, conversation) {
  if (!user || !conversation) return false;
  if (user.isGM) return true;
  return isParticipant(user.id, conversation);
}

/**
 * @param {{id: string, isGM: boolean}} user
 * @param {object} conversation
 * @returns {boolean}
 */
export function canSendAsUser(user, conversation) {
  if (!user || !conversation) return false;
  if (conversation.archived) return false;
  return user.isGM || isParticipant(user.id, conversation);
}

/**
 * @param {{id: string, isGM: boolean}} user
 * @param {object} conversation
 * @param {string} contactId
 * @returns {boolean}
 */
export function canSendAsNpc(user, conversation, contactId) {
  if (!user || !conversation || !user.isGM) return false;
  if (conversation.archived) return false;
  return conversation.contactIds.includes(contactId);
}

/**
 * @param {{id: string, isGM: boolean}} user
 * @returns {boolean}
 */
export function canAdminister(user) {
  return Boolean(user?.isGM);
}
