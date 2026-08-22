/**
 * @fileoverview Marca do Cacador - awakening, activation, and life-cost tracking.
 *
 * Two variants:
 * - Normal: awakened via FDV CD 18 test. Costs years of life = +1d12 damage per year.
 * - Nascido Marcado: (Marca do Destino + Descendente Perdido). Uses Graus de Intensidade = +1d20.
 *
 * @module marca-cacador-service
 */

import { parseNumber, isDestinyMark } from "./parsing.mjs";

const AWAKENING_CD = { base: 18, descendente: 16, marca_destino: 14 };

/**
 * Determine the FDV CD for awakening the Marca do Cacador.
 * @param {object} props - actor.system.props
 * @returns {number} CD value (18, 16, 14) or 0 for auto-awaken
 */
export function getAwakeningCD(props) {
  const hasDestinyMark = isDestinyMark(props.hab_escolhida);
  const isDescendente = String(props.origem ?? "").toLowerCase().includes("descendente perdido");
  if (hasDestinyMark && isDescendente) return 0;
  if (hasDestinyMark) return AWAKENING_CD.marca_destino;
  if (isDescendente) return AWAKENING_CD.descendente;
  return AWAKENING_CD.base;
}

/**
 * Check if the actor qualifies for awakening (Exterminador, level 12+).
 * @param {Actor} actor
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkAwakeningQualification(actor) {
  const props = actor.system?.props ?? {};
  const classKey = String(props.classe ?? "").toLowerCase();
  const isExterminador = classKey.includes("exterminador");
  const level = parseNumber(props.level) || parseNumber(props.nivel) || 0;
  if (!isExterminador) return { ok: false, reason: "Apenas Exterminadores podem despertar a Marca do Cacador." };
  if (level < 12) return { ok: false, reason: "Requer nivel 12 ou superior para despertar a Marca." };
  return { ok: true };
}

/**
 * Check if actor is Nascido Marcado (Marca do Destino + Descendente Perdido).
 * @param {object} props
 * @returns {boolean}
 */
export function isNascidoMarcado(props) {
  const hasDestinyMark = isDestinyMark(props.hab_escolhida);
  const isDescendente = String(props.origem ?? "").toLowerCase().includes("descendente perdido");
  return hasDestinyMark && isDescendente;
}

/**
 * Calculate damage bonus from burning life.
 * Normal: 1 year = +1d12. Nascido Marcado: 1 degree = +1d20.
 * @param {Actor} actor
 * @param {number} cost - Years of life or degrees of intensity to burn
 * @returns {{ formula: string, label: string }}
 */
export function calculateMarkDamage(actor, cost) {
  const props = actor.system?.props ?? {};
  const nascido = isNascidoMarcado(props);
  const dice = Math.max(1, Math.trunc(cost));
  if (nascido) {
    return { formula: `${dice}d20`, label: `${dice} Grau(s) de Intensidade = ${dice}d20` };
  }
  return { formula: `${dice}d12`, label: `${dice} Ano(s) de Vida = ${dice}d12` };
}

/**
 * Activate the Marca do Cacador in combat.
 * Sets marca_ativa, marca_dano_dados, marca_dano_faces on the actor.
 * @param {Actor} actor
 * @param {number} cost - Years/degrees to burn
 * @returns {Promise<boolean>}
 */
export async function activateMark(actor, cost) {
  if (!actor) throw new Error("activateMark: actor is required");
  const c = Math.max(1, Math.trunc(cost));
  const { formula } = calculateMarkDamage(actor, c);
  const match = formula.match(/(\d+)d(\d+)/);
  if (!match) return false;
  const patch = {
    "system.props.marca_ativa": 1,
    "system.props.marca_dano_dados": Number(match[1]),
    "system.props.marca_dano_faces": Number(match[2]),
    "system.props.marca_anos_queimados": c,
  };
  await actor.update(patch);
  return true;
}

/**
 * Deactivate the Marca do Cacador (end of combat).
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function deactivateMark(actor) {
  if (!actor) return false;
  await actor.update({
    "system.props.marca_ativa": 0,
    "system.props.marca_dano_dados": 0,
    "system.props.marca_dano_faces": 0,
  });
  return true;
}

/**
 * Get a summary of the Marca do Cacador state.
 * @param {Actor} actor
 * @returns {object}
 */
export function getMarkSummary(actor) {
  const props = actor.system?.props ?? {};
  const nascido = isNascidoMarcado(props);
  const despertada = parseNumber(props.marca_despertada) === 1;
  const ativa = parseNumber(props.marca_ativa) === 1;
  const anos = parseNumber(props.marca_anos_queimados) || 0;
  const cd = getAwakeningCD(props);
  return { nascido, despertada, ativa, anosQueimados: anos, awakeningCD: cd };
}
