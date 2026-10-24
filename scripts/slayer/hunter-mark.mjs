/**
 * @fileoverview Regras puras da Marca do Caçador (v6) que o pipeline e o macro precisam ler.
 * Regra: docs/Sistema/04 - Marca do Caçador/Marca do Caçador.md.
 * Tudo aqui deriva dos campos já persistidos na ficha (`marca_*`, `hab_escolhida`,
 * `origem_dropdown`), então não há campo novo que o CSB possa descartar.
 */
import { parseNumber } from '../parsing.mjs';

function toInt(value) {
    return Math.trunc(parseNumber(value)) || 0;
}

export function isDestinyMark(props = {}) {
    return String(props.hab_escolhida ?? '').includes('hab_escolhida_marca_destino');
}

export function isLostDescendant(props = {}) {
    return String(props.origem_dropdown ?? '').includes('origem_descendente_perdido');
}

/** Nascido Marcado = Marca do Destino + Descendente Perdido. */
export function isBornMarked(props = {}) {
    return isDestinyMark(props) && isLostDescendant(props);
}

/** Anos de vida gastos na ativação atual (Marca normal: anos; Nascido Marcado: só o Overdrive). */
function burnedYears(props = {}) {
    return Math.max(0, toInt(props.marca_anos_queimados) + toInt(props.marca_overdrive));
}

/**
 * Crítico Marcado. Contra Oni: Marca normal −1 na margem (19), −3 com 3 ou mais anos
 * queimados (17); Nascido Marcado 18. Contra qualquer outra criatura vale a margem da arma.
 * @returns {number|null} margem da Marca, ou null quando ela não se aplica.
 */
export function markCriticalMargin(props = {}, { targetIsOni = false } = {}) {
    if (toInt(props.marca_ativa) !== 1 || targetIsOni !== true) return null;
    if (isBornMarked(props)) return 18;
    return burnedYears(props) >= 3 ? 17 : 19;
}

/**
 * Frequência Cardíaca Elevada: 1×/turno, em Ação de Ataque, um Ataque Padrão adicional.
 * Não vale em Ação Completa nem quando uma técnica de Respiração substitui o ataque.
 */
export function markExtraAttack(
    props = {},
    { actionType = '', classTechniquePending = false, usedThisTurn = false } = {}
) {
    return (
        toInt(props.marca_ativa) === 1 &&
        actionType === 'ataque' &&
        classTechniquePending !== true &&
        usedThisTurn !== true
    );
}

/** Overdrive só existe para o Nascido Marcado e queima 1 ano por ponto, limitado à vida restante. */
export function markOverdriveLimit(props = {}) {
    if (!isBornMarked(props)) return 0;
    return Math.max(0, Math.floor(parseNumber(props.vid_rest_num)));
}

/**
 * Campos de `system.props` gravados na ativação.
 * Marca normal: `power` anos, d12 cada. Nascido Marcado: `power` de Intensidade + Overdrive, d20 cada.
 */
export function markActivationFields(props = {}, { power = 0, overdrive = 0 } = {}) {
    const born = isBornMarked(props);
    const extra = born
        ? Math.min(Math.max(0, toInt(overdrive)), markOverdriveLimit(props))
        : 0;
    const base = Math.max(0, toInt(power));
    return {
        marca_anos_queimados: born ? 0 : base,
        marca_intensidade: born ? base : 0,
        marca_overdrive: extra,
        marca_dano_dados: base + extra,
        marca_dano_faces: born ? 20 : 12,
    };
}

/**
 * Custos do encerramento.
 * - `lifeCost`: anos descontados de `vid_rest_num` (anos queimados; a Marca normal de quem tem
 *   Marca do Destino nv12 paga mais 1 ano por ativação, sem somar 1d6 necrótico).
 * - `necroticDice`: d6 necrótico irredutível, 1 por ano queimado.
 * - `exhaustion`: Marca normal 2/4/6/8 por ativação no dia; Nascido Marcado 1 quando a
 *   Intensidade total passa de ⌈nível de Respiração ÷ 2⌉, senão 0.
 * @param {object} props
 * @param {number} level Nível do personagem.
 */
export function markFinishOutcome(props = {}, level = 0) {
    const born = isBornMarked(props);
    const burned = burnedYears(props);
    const activations = toInt(props.marca_ativacoes_dia) + 1;
    const destinyExtra = !born && isDestinyMark(props) && toInt(level) >= 12 ? 1 : 0;
    const breath = Math.max(1, toInt(props.nvl_respiracao_num));
    const intensity = toInt(props.marca_intensidade) + toInt(props.marca_overdrive);
    const exhaustion = born
        ? intensity > Math.ceil(breath / 2)
            ? 1
            : 0
        : Math.min(8, activations * 2);
    return {
        activations,
        lifeCost: burned + destinyExtra,
        necroticDice: burned,
        exhaustion,
        destinyExtra,
    };
}
