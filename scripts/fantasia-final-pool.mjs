/**
 * Fantasia Final (9º Estilo do Sonhos): o dano é um pool de dados, rolado uma vez ao fim da sequência.
 * Regra do operador (2026-11-23):
 *   1. Cada acerto soma os dados da Forma (4d4, 6d4 ou 7d4); a quantidade cresce a cada acerto acumulado.
 *   2. Acerto crítico aplica o crítico sobre o próprio dano: os dados daquele acerto dobram.
 *   3. A sequência continua depois do crítico.
 */

const PURE_DICE = /^(\d+)d(\d+)$/;

/**
 * Fórmula única do pool, ex.: 4d4 em 3 acertos (um crítico) → 16d4. Null quando não há acerto
 * ou quando o dano base não é só dados (não sabemos somar esse caso aqui).
 */
export function pooledSequenceDamageFormula(baseDado, attempts = []) {
    const match = PURE_DICE.exec(String(baseDado ?? '').trim());
    if (!match) return null;
    const dicePerHit = Number(match[1]);
    const faces = Number(match[2]);
    let dice = 0;
    for (const attempt of attempts) {
        if (!attempt?.hit) continue;
        dice += dicePerHit * (attempt.critical ? 2 : 1);
    }
    return dice > 0 ? `${dice}d${faces}` : null;
}
