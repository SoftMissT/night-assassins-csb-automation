/**
 * @fileoverview Serviço de Concentração Total — Estágios 2 e 3.
 *
 * Estágio 2 (Ativo):
 * - Ativação: Ação Especial no início do turno
 * - Duração: FDV rodadas
 * - Bônus: +2 VIT temp, +1.5m movimento, -1 custo PDR (mín 1)
 * - Fim: Exaustão 1 nível, ou Ofegante se 0 PDR
 *
 * Estágio 3 (Passivo — Concentração Total Constante):
 * - Requisito: Nível Respiração 4 + Treinamento completo
 * - Permanente: +1 VIT, +1.5m movimento, +FDV PDR em sono
 * - Reduz custo PDR de todas as Formas
 * - Imune a Exaustão/Ofegante do Estágio 2
 *
 * @module concentration-total-service
 */

import { parseNumber } from "./parsing.mjs";

/**
 * Determine o estágio de Concentração Total do personagem.
 * @param {object} props
 * @returns {0|2|3} 0 = não treinado, 2 = Estágio 2, 3 = Estágio 3 (Constante)
 */
export function getConcentrationStage(props) {
  if (parseNumber(props.concentracao_total_constante) === 1) return 3;
  if (parseNumber(props.concentracao_total_nivel) >= 2) return 2;
  return 0;
}

/**
 * Check if the actor can activate Concentration Total (Stage 2).
 * @param {object} props
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canActivateStage2(props) {
  const stage = getConcentrationStage(props);
  if (stage === 3) return { ok: false, reason: "Concentração Total Constante (Estágio 3) é passiva." };
  if (stage < 2) return { ok: false, reason: "Requer Nível de Respiração 3+ para Estágio 2." };
  const pdr = parseNumber(props.pdr_slayer_atual_valor_display) || parseNumber(props.pdr_slayer_total_conta);
  if (pdr <= 0) return { ok: false, reason: "Sem PDR disponível (Esgotamento Respiratório)." };
  return { ok: true };
}

/**
 * Get the duration of Concentration Total in rounds (FDV).
 * @param {object} props
 * @returns {number}
 */
export function getConcentrationDuration(props) {
  return Math.max(1, parseNumber(props.fdv_display));
}

/**
 * Get the movement bonus from Concentration Total.
 * @param {0|2|3} stage
 * @returns {number} meters
 */
export function getMovementBonus(stage) {
  if (stage === 3) return 1.5;
  if (stage === 2) return 1.5;
  return 0;
}

/**
 * Get the VIT bonus from Concentration Total.
 * @param {0|2|3} stage
 * @returns {number}
 */
export function getVitBonus(stage) {
  if (stage === 3) return 1;
  if (stage === 2) return 2;
  return 0;
}

/**
 * Get PDR cost reduction for breathing forms.
 * @param {0|2|3} stage
 * @param {number} originalCost
 * @returns {number}
 */
export function getBreathingCostReduction(stage, originalCost) {
  if (stage === 3) return Math.max(1, originalCost - 1);
  if (stage === 2) return Math.max(1, originalCost - 1);
  return originalCost;
}

/**
 * Build the activation patch for Concentration Total (Stage 2).
 * @param {object} props
 * @returns {object} patch
 */
export function buildActivationPatch(props) {
  const duration = getConcentrationDuration(props);
  return {
    "system.props.concentracao_total_ativa": 1,
    "system.props.concentracao_total_rodadas": duration,
    "system.props.concentracao_total_rodadas_max": duration,
  };
}

/**
 * Build the end-of-duration patch (Exaustão + remove active).
 * @param {object} props
 * @param {boolean} isImmune - true if Stage 3
 * @returns {object} patch
 */
export function buildEndDurationPatch(props, isImmune = false) {
  const exhaustion = isImmune ? 0 : 1;
  return {
    "system.props.concentracao_total_ativa": 0,
    "system.props.concentracao_total_rodadas": 0,
    "system.props.status_slayer_exaustao": Math.min(8, parseNumber(props.status_slayer_exaustao) + exhaustion),
  };
}

/**
 * Build the patch for running out of PDR during Concentration Total.
 * @returns {object} patch
 */
export function buildZeroPdrPatch() {
  return {
    "system.props.concentracao_total_ativa": 0,
    "system.props.concentracao_total_rodadas": 0,
  };
}

/**
 * Get a summary of the Concentration Total state.
 * @param {object} props
 * @returns {object}
 */
export function getConcentrationSummary(props) {
  const stage = getConcentrationStage(props);
  const active = parseNumber(props.concentracao_total_ativa) === 1;
  const roundsLeft = parseNumber(props.concentracao_total_rodadas);
  const roundsMax = parseNumber(props.concentracao_total_rodadas_max);
  return {
    stage,
    active,
    roundsLeft,
    roundsMax,
    vitBonus: getVitBonus(active ? 2 : stage),
    movementBonus: getMovementBonus(active ? 2 : stage),
  };
}
