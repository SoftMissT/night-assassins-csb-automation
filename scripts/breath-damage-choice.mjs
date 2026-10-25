/**
 * @fileoverview Dano da Forma escolhido pelo jogador e guardado no Item.
 *
 * Nas Respirações abaixo, o diálogo da Forma mostra o dano do nível já preenchido
 * com o valor guardado no Item (`nvlN_dano`, que nasce com o da tabela). O jogador
 * pode trocar; vale na hora e fica salvo. Só o dano base da Forma muda: bônus
 * automáticos (Calor, Metal, Marca, derivados), custo, status e efeitos seguem.
 */

import { isValidDamageFormula, resolveAttributeRefs } from './damage-formula.mjs';

export const CHOSEN_DAMAGE_BREATHINGS = Object.freeze(
    new Set(['Vento', 'Chamas', 'Pedra', 'Metal', 'Neve'])
);

/** Estados das Respirações cujo plano guarda o dano da Forma em `pendingDamage`. */
const STATE_KEY_PATTERN = /^system\.props\.resp_(chamas|vento|neve)_estado$/u;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Troca cada ocorrência do dado base pela escolha, sem casar dentro de outro número
 * (`2d4` não casa em `12d4` nem em `2d40`). Fórmula que era só o base vira a escolha
 * pura; dentro de uma soma, a escolha entra entre parênteses.
 */
export function replaceBaseFormula(formula, base, chosen) {
    const text = String(formula ?? '');
    const from = String(base ?? '').trim();
    const to = String(chosen ?? '').trim();
    if (!text || !from || !to || from === to) return text;
    if (text.trim() === from) return to;
    const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(from)}(?![\\w.])`, 'gu');
    return text.replace(pattern, `(${to})`);
}

/** Aplica a troca em todo objeto do estado que pertence à Forma usada (`source`). */
export function replaceFormDamage(state, formId, base, chosen) {
    const visit = (node) => {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        const owned = node.source === formId;
        const next = {};
        for (const [key, value] of Object.entries(node)) {
            if (owned && key === 'formula') next[key] = replaceBaseFormula(value, base, chosen);
            else if (owned && key === 'formulas' && Array.isArray(value))
                next[key] = value.map((formula) => replaceBaseFormula(formula, base, chosen));
            else next[key] = visit(value);
        }
        return next;
    };
    return visit(state);
}

/**
 * Reescreve, no patch do plano, o dano da Forma nos estados de Chamas, Vento e Neve.
 * @returns {object} só as chaves alteradas
 */
export function applyChosenDamageToPatch(patch, { formId, base, chosen }) {
    const changed = {};
    if (!base || !chosen || base === chosen) return changed;
    for (const [key, raw] of Object.entries(patch ?? {})) {
        if (!STATE_KEY_PATTERN.test(key) || typeof raw !== 'string') continue;
        let state;
        try {
            state = JSON.parse(raw);
        } catch {
            continue;
        }
        const next = JSON.stringify(replaceFormDamage(state, formId, base, chosen));
        if (next !== raw) changed[key] = next;
    }
    return changed;
}

/**
 * Normaliza e valida o dano digitado. Vazio volta ao guardado.
 * @returns {{ok: true, formula: string} | {ok: false, reason: string}}
 */
export function resolveChosenDamage(input, stored, attrValues = {}) {
    const formula = String(input ?? '').trim() || String(stored ?? '').trim();
    if (!formula) return { ok: true, formula: '' };
    if (!isValidDamageFormula(resolveAttributeRefs(formula, attrValues)))
        return { ok: false, reason: `Dano inválido: "${formula}". Use dados e números, como 2d6 + @for.` };
    return { ok: true, formula };
}
