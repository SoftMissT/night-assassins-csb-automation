/**
 * @fileoverview Serviço da Respiração da Recuperação — 4 Formas.
 *
 * 1ª Coagulação Forçada: Estanca Sangramento/Hemorragia, cura PDV+PDR
 * 2ª Expurgo Térmico: Reteste Veneno/Paralisia, remove Fadiga Espiritual (Nv2+)
 * 3ª Choque Adrenérgico: Reação para ficar com 1 PDV, ignora Exaustão (Sem Teste)
 * 4ª Sinfonia dos Pulmões: Remove toda Fadiga/Exaustão, cura massiva, causa Ofegante (Nv3+)
 *
 * Todas custam 0 PDR.
 *
 * @module recovery-breathing-service
 */

import { parseNumber } from "./parsing.mjs";

const RECOVERY_FORMS = {
  coagulacao: {
    id: "coagulacao",
    nome: "Coagulação Forçada",
    tipo: "Ação Especial",
    teste: true,
    minLevel: 1,
    efeito: "Estanca Sangramento e Hemorragia",
    pdvDice: (level) => level + 1,
    pdvDiceType: "d6",
    pdrDice: (level) => level + 1,
    pdrDiceType: "d6",
  },
  expurgo: {
    id: "expurgo",
    nome: "Expurgo Térmico",
    tipo: "Ação Especial",
    teste: true,
    minLevel: 2,
    efeito: "Reteste Veneno/Paralisia, remove Fadiga Espiritual",
    pdvDice: (level) => level,
    pdvDiceType: "d6",
    pdrDice: (level) => level,
    pdrDiceType: "d6",
    retesteBonus: (level) => (level - 1) * 2,
  },
  choque: {
    id: "choque",
    nome: "Choque Adrenérgico",
    tipo: "Reação",
    teste: false,
    minLevel: 1,
    efeito: "Fica com 1 PDV ao receber dano letal, ignora Exaustão",
    pdvDice: null,
    pdrDice: (level) => level + 1,
    pdrDiceType: "d6",
    ignoreExhaustionTurns: (level) => (level >= 3 ? 2 : 1),
  },
  sinfonia: {
    id: "sinfonia",
    nome: "Sinfonia dos Pulmões",
    tipo: "Ação Completa",
    teste: true,
    minLevel: 3,
    efeito: "Remove toda Exaustão e Fadiga",
    pdvDice: (level) => level * 2,
    pdvDiceType: "d8",
    pdrDice: (level) => level * 2,
    pdrDiceType: "d8",
    pdvMultiplier: 2,
    pdrMultiplier: 2,
    causaOfegante: true,
  },
};

const FDV_CD_BY_LEVEL = { 1: 14, 2: 12, 3: 10, 4: 8 };

/**
 * Get all Recovery Breathing forms.
 * @returns {object}
 */
export function getRecoveryForms() {
  return RECOVERY_FORMS;
}

/**
 * Get a specific form by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getRecoveryForm(id) {
  return RECOVERY_FORMS[id] ?? null;
}

/**
 * Get the FDV CD for a test based on breathing level.
 * @param {number} breathingLevel
 * @returns {number}
 */
export function getRecoveryCD(breathingLevel) {
  return FDV_CD_BY_LEVEL[Math.min(4, Math.max(1, breathingLevel))] ?? 14;
}

/**
 * Check if a form is available at the given breathing level.
 * @param {string} formId
 * @param {number} breathingLevel
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canUseForm(formId, breathingLevel) {
  const form = RECOVERY_FORMS[formId];
  if (!form) return { ok: false, reason: `Forma desconhecida: ${formId}` };
  if (breathingLevel < form.minLevel) {
    return { ok: false, reason: `Requer Nível de Respiração ${form.minLevel} (atual: ${breathingLevel})` };
  }
  return { ok: true };
}

/**
 * Calculate PDV recovery dice formula.
 * @param {string} formId
 * @param {number} breathingLevel
 * @param {number} vit
 * @returns {{ formula: string, amount: number }}
 */
export function calculatePdvRecovery(formId, breathingLevel, vit) {
  const form = RECOVERY_FORMS[formId];
  if (!form || !form.pdvDice) return { formula: "0", amount: 0 };
  const dice = form.pdvDice(breathingLevel);
  const diceType = form.pdvDiceType ?? "d6";
  const multiplier = form.pdvMultiplier ?? 1;
  const avgFace = diceType === "d8" ? 4.5 : 3.5;
  const formula = `${dice}${diceType} + ${vit}${multiplier > 1 ? ` × ${multiplier}` : ""}`;
  const avgRoll = dice * avgFace;
  const amount = Math.floor(avgRoll + vit) * multiplier;
  return { formula, amount };
}

/**
 * Calculate PDR recovery dice formula.
 * @param {string} formId
 * @param {number} breathingLevel
 * @param {number} fdv
 * @returns {{ formula: string, amount: number }}
 */
export function calculatePdrRecovery(formId, breathingLevel, fdv) {
  const form = RECOVERY_FORMS[formId];
  if (!form) return { formula: "0", amount: 0 };
  const dice = form.pdrDice(breathingLevel);
  const diceType = form.pdrDiceType ?? "d6";
  const multiplier = form.pdrMultiplier ?? 1;
  const avgFace = diceType === "d8" ? 4.5 : 3.5;
  const formula = `${dice}${diceType} + ${fdv}${multiplier > 1 ? ` × ${multiplier}` : ""}`;
  const avgRoll = dice * avgFace;
  const amount = Math.floor(avgRoll + fdv) * multiplier;
  return { formula, amount };
}

/**
 * Get the retest bonus for Expurgo Térmico.
 * @param {number} breathingLevel
 * @returns {number}
 */
export function getExpurgoRetestBonus(breathingLevel) {
  return RECOVERY_FORMS.expurgo.retesteBonus(breathingLevel);
}

/**
 * Get the exhaustion ignore turns for Choque Adrenérgico.
 * @param {number} breathingLevel
 * @returns {number}
 */
export function getChoqueIgnoreTurns(breathingLevel) {
  return RECOVERY_FORMS.choque.ignoreExhaustionTurns(breathingLevel);
}

/**
 * Check if the form causes Ofegante (only Sinfonia).
 * @param {string} formId
 * @returns {boolean}
 */
export function causesOfegante(formId) {
  return RECOVERY_FORMS[formId]?.causaOfegante ?? false;
}

/**
 * Build the effect summary for a successful form use.
 * @param {string} formId
 * @param {number} breathingLevel
 * @param {object} props - actor props (vit_display, fdv_display)
 * @returns {object}
 */
export function buildFormEffect(formId, breathingLevel, props) {
  const form = RECOVERY_FORMS[formId];
  if (!form) return null;

  const vit = parseNumber(props.vit_display);
  const fdv = parseNumber(props.fdv_display);
  const pdv = calculatePdvRecovery(formId, breathingLevel, vit);
  const pdr = calculatePdrRecovery(formId, breathingLevel, fdv);

  return {
    formId,
    nome: form.nome,
    tipo: form.tipo,
    efeito: form.efeito,
    pdvRecovery: pdv,
    pdrRecovery: pdr,
    ofegante: causesOfegante(formId),
    ignoreExhaustion: formId === "choque" ? getChoqueIgnoreTurns(breathingLevel) : 0,
    retesteBonus: formId === "expurgo" ? getExpurgoRetestBonus(breathingLevel) : 0,
  };
}
