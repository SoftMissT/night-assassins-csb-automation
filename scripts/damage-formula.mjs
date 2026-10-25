/**
 * @fileoverview Fórmula livre de dano e visibilidade da mensagem (Foundry v14).
 *
 * Fonte única para o diálogo (prévia) e o serviço (rolagem): a entrada aceita
 * qualquer fórmula do Foundry (`2d6+1d4`, `4d6kh3`, `1d8 + @for`) e soma o fixo
 * e os atributos marcados depois dela.
 */

import { ATTRIBUTES } from './constants.mjs';

/** Modos de visibilidade do chat no v14 (`CONFIG.ChatMessage.modes`). */
export const MESSAGE_MODES = Object.freeze([
    { key: 'public', label: 'Público' },
    { key: 'gm', label: 'Privado (GM)' },
    { key: 'blind', label: 'Cego (só GM)' },
    { key: 'self', label: 'Só para mim' },
]);

const LEGACY_ROLL_MODES = Object.freeze({
    publicroll: 'public',
    gmroll: 'gm',
    blindroll: 'blind',
    selfroll: 'self',
});

const ATTRIBUTE_KEYS = new Set(ATTRIBUTES.map((attribute) => attribute.key));

/**
 * Normaliza o modo pedido (v14 ou legado `*roll`). Ausente ou inválido usa o
 * modo atual do chat do usuário.
 * @param {string} [mode]
 * @returns {string}
 */
export function resolveMessageMode(mode) {
    const key = LEGACY_ROLL_MODES[mode] ?? mode;
    if (MESSAGE_MODES.some((entry) => entry.key === key)) return key;
    return globalThis.game?.settings?.get?.('core', 'messageMode') || 'public';
}

/**
 * `<option>`s de visibilidade com o modo atual do chat pré-selecionado.
 * @returns {string}
 */
export function messageModeOptionsHtml() {
    const current = resolveMessageMode();
    return MESSAGE_MODES.map(
        (mode) =>
            `<option value="${mode.key}"${mode.key === current ? ' selected' : ''}>${mode.label}</option>`
    ).join('');
}

/**
 * Troca `@vit`, `@for`… pelo valor do atributo. Referência desconhecida fica
 * intacta para o Roll acusar a fórmula inválida.
 * @param {string} formula
 * @param {Record<string, number>} attrValues
 * @returns {string}
 */
export function resolveAttributeRefs(formula, attrValues = {}) {
    return String(formula ?? '').replace(/@([a-z]+)\b/gi, (match, key) => {
        const attribute = key.toLowerCase();
        if (!ATTRIBUTE_KEYS.has(attribute)) return match;
        const value = Math.trunc(Number(attrValues[attribute]) || 0);
        return value < 0 ? `(${value})` : String(value);
    });
}

function signed(value) {
    return value > 0 ? `+ ${value}` : `- ${Math.abs(value)}`;
}

/**
 * Fórmula final de uma entrada: fórmula livre + fixo + atributos marcados.
 * @param {string} dado Fórmula livre digitada pelo usuário.
 * @param {number} fixo
 * @param {string[]} selAttrs
 * @param {Record<string, number>} attrValues
 * @returns {string} `'0'` quando a entrada está vazia.
 */
export function buildEntryFormula(dado, fixo, selAttrs = [], attrValues = {}) {
    const parts = [];
    const formula = resolveAttributeRefs(String(dado ?? '').trim(), attrValues);
    if (formula) parts.push(formula);
    const extras = [Number(fixo) || 0, ...selAttrs.map((key) => Number(attrValues[key]) || 0)];
    for (const value of extras) {
        if (value === 0) continue;
        parts.push(parts.length === 0 ? String(value) : signed(value));
    }
    return parts.length > 0 ? parts.join(' ') : '0';
}

/**
 * Valida a fórmula com o Roll do core quando disponível.
 * @param {string} formula
 * @returns {boolean}
 */
export function isValidDamageFormula(formula) {
    const validate = globalThis.foundry?.dice?.Roll?.validate ?? globalThis.Roll?.validate;
    if (typeof validate !== 'function') return true;
    try {
        return validate.call(globalThis.foundry?.dice?.Roll ?? globalThis.Roll, formula) === true;
    } catch (_) {
        return false;
    }
}
