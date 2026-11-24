/**
 * Regras de combate Homebrew (operador, 2026-11-23). Funções puras: sem Foundry, sem documento.
 * A ligação aos fluxos de Acerto, Defesa e Dano é feita à parte (ver CHANGELOG, pendências).
 */

/** Falha crítica no acerto ou na defesa: o d20 natural é 1. */
export function isCriticalFailure(natural) {
    return Number(natural) === 1;
}

/**
 * Regra 3: o ataque de oportunidade é um Acerto do inimigo contra a Esquiva ou o Bloqueio de quem
 * falhou. Sem CD. Empate favorece quem defende (suposição, ver pendências).
 */
export function opportunityAttackHits({ attackTotal, defenseTotal }) {
    return Number(attackTotal) > Number(defenseTotal);
}

/** Regra 4: bônus de Acerto contra o inimigo que causou o crítico na defesa. */
export const CRITICAL_DEFENSE_ATTACK_BONUS = 2;

/**
 * Regra 4: guarda, por inimigo (UUID), o bônus de +2 no Acerto. Retorna um mapa novo.
 * O bônus dura até o próximo ataque contra aquele inimigo específico.
 */
export function grantCriticalDefenseBonus(bonuses = {}, enemyUuid) {
    if (!enemyUuid) return { ...bonuses };
    return { ...bonuses, [enemyUuid]: CRITICAL_DEFENSE_ATTACK_BONUS };
}

/**
 * Regra 4: consome o bônus no ataque contra o inimigo. Devolve o bônus aplicado e o mapa sem ele.
 */
export function consumeCriticalDefenseBonus(bonuses = {}, enemyUuid) {
    const source = bonuses ?? {};
    const bonus = Number(source[enemyUuid]) || 0;
    const rest = { ...source };
    delete rest[enemyUuid];
    return { bonus, bonuses: rest };
}

/**
 * Regra 5 (livro oficial, "Críticos Negativos em Testes de Defesa"): +1d4 por dezena de dano que
 * receberia; de 0 a 19 de dano, ainda é 1d4. Sem dano, nada. Retorna a quantidade de dados.
 * Base: o dano que o ataque causaria (suposição, ver pendências). 9 → 1; 27 → 2; 0 → 0.
 */
export function fumbleDefenseExtraDice(incomingDamage) {
    const damage = Math.max(0, Number(incomingDamage) || 0);
    return damage > 0 ? Math.max(1, Math.floor(damage / 10)) : 0;
}

/** Fórmula do dano extra da regra 5, ou '' quando não há dezena. */
export function fumbleDefenseExtraFormula(incomingDamage) {
    const dice = fumbleDefenseExtraDice(incomingDamage);
    return dice > 0 ? `${dice}d4` : '';
}
