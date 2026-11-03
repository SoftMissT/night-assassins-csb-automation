/**
 * Perfil de dano persistido no próprio Item.
 * Mantém o formato de entrada do diálogo de dano e valida antes de gravar.
 */

import { normalizePresetEntry } from './damage-preset-service.mjs';

export const ITEM_DAMAGE_PROFILE_KEY = 'na_dano_perfil';
export const ITEM_DAMAGE_PROFILE_VERSION = 1;
export const MAX_ITEM_DAMAGE_ENTRIES = 8;

function parseRaw(raw) {
    if (typeof raw !== 'string') return raw;
    try {
        return JSON.parse(raw || '{}');
    } catch (_) {
        return null;
    }
}

/**
 * @param {unknown} raw
 * @returns {{version:number,entries:object[]}|null}
 */
export function normalizeItemDamageProfile(raw) {
    const parsed = parseRaw(raw);
    const source = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(source) || source.length === 0 || source.length > MAX_ITEM_DAMAGE_ENTRIES)
        return null;
    const entries = source.map((entry) => normalizePresetEntry(entry));
    if (entries.some((entry) => !entry)) return null;
    return { version: ITEM_DAMAGE_PROFILE_VERSION, entries };
}

export function itemDamageProfileFromProps(props = {}) {
    return normalizeItemDamageProfile(props[ITEM_DAMAGE_PROFILE_KEY]);
}

export function itemDamageProfilePatch(profile) {
    const normalized = normalizeItemDamageProfile(profile);
    if (!normalized) return null;
    return {
        [`system.props.${ITEM_DAMAGE_PROFILE_KEY}`]: JSON.stringify(normalized),
    };
}

/**
 * Persiste o perfil no Item, respeitando a mesma fronteira de edição das fichas.
 * @param {Item} item
 * @param {unknown} profile
 * @returns {Promise<{ok:boolean,profile?:object,reason?:string}>}
 */
export async function saveItemDamageProfile(item, profile) {
    if (!item?.update) return { ok: false, reason: 'Item inválido.' };
    if (!item.isOwner && !globalThis.game?.user?.isGM)
        return { ok: false, reason: 'Você não pode editar este Item.' };
    const normalized = normalizeItemDamageProfile(profile);
    if (!normalized) return { ok: false, reason: 'Perfil de dano inválido.' };
    await item.update(itemDamageProfilePatch(normalized), {
        naCsbAutomation: true,
        naItemDamageProfile: true,
    });
    return { ok: true, profile: normalized };
}
