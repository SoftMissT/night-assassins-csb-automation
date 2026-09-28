/**
 * @fileoverview Presets de dano registráveis pelo usuário.
 *
 * Dados do usuário guardados em `system.props.dano_presets` no próprio Actor.
 * Não alteram catálogo, custo, ação, calor, crítico nem passivas: apenas
 * reutilizam o formato de entrada do diálogo de dano.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO } from './constants.mjs';

export const DAMAGE_PRESETS_KEY = 'dano_presets';
export const DAMAGE_PRESETS_VERSION = 2;
export const MAX_DAMAGE_PRESETS = 60;
export const MAX_PRESET_ENTRIES = 8;
export const DEFAULT_PRESET_GROUP = 'normal';

/** Grupos oferecidos na UI; grupo livre continua aceito. */
export const PRESET_GROUPS = Object.freeze([
    { key: 'normal', label: 'Normal' },
    { key: 'chamas', label: 'Chamas' },
    { key: 'agua', label: 'Água' },
    { key: 'vento', label: 'Vento' },
    { key: 'pedra', label: 'Pedra' },
    { key: 'neve', label: 'Neve' },
    { key: 'nevoa', label: 'Névoa' },
    { key: 'metal', label: 'Metal' },
]);

const SAFE_FORMULA = /^[a-zA-Z0-9_\s+\-*/().,@]+$/u;
const MAX_FORMULA_LENGTH = 80;
const MAX_NAME_LENGTH = 80;
const MAX_GROUP_LENGTH = 40;
const MAX_BREATHING_LENGTH = 60;

const ACTION_KEYS = new Set(
    TIPOS_ACAO.filter((type) => type.damage && type.key !== 'epica').map((type) => type.key)
);
const DAMAGE_TYPE_KEYS = new Set(TIPOS_DANO.map((type) => type.key));
const ATTRIBUTE_KEYS = new Set(ATTRIBUTES.map((attribute) => attribute.key));

const GROUP_BY_TOKEN = new Map();
for (const group of PRESET_GROUPS) {
    GROUP_BY_TOKEN.set(normalizeToken(group.label), group.key);
    GROUP_BY_TOKEN.set(normalizeToken(group.key), group.key);
}

function normalizeToken(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR');
}

function presetId() {
    return (
        globalThis.foundry?.utils?.randomID?.() ??
        globalThis.crypto?.randomUUID?.() ??
        `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
}

/**
 * Normaliza um grupo: rótulos e slugs conhecidos viram a chave canônica;
 * qualquer outro texto é preservado como grupo livre.
 * @param {string} value
 * @returns {string}
 */
export function presetGroupKey(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return DEFAULT_PRESET_GROUP;
    return GROUP_BY_TOKEN.get(normalizeToken(raw)) ?? raw.slice(0, MAX_GROUP_LENGTH);
}

/**
 * Rótulo de exibição para um grupo.
 * @param {string} key
 * @returns {string}
 */
export function presetGroupLabel(key) {
    const normalized = presetGroupKey(key);
    return PRESET_GROUPS.find((group) => group.key === normalized)?.label ?? normalized;
}

function normalizeAttributes(value) {
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const seen = new Set();
    const output = [];
    for (const entry of list) {
        const key = normalizeToken(entry);
        if (!ATTRIBUTE_KEYS.has(key) || seen.has(key)) continue;
        seen.add(key);
        output.push(key);
    }
    return output;
}

function normalizeDamageTypes(value) {
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const seen = new Set();
    const output = [];
    for (const entry of list) {
        const key = normalizeToken(entry);
        if (!DAMAGE_TYPE_KEYS.has(key) || seen.has(key)) continue;
        seen.add(key);
        output.push(key);
    }
    return output;
}

/**
 * Normaliza uma entrada de dano no formato aceito pelo diálogo.
 * @param {object} entry
 * @returns {{tipoAcao:string,dado:string,fixo:number,attrs:string[],tiposDano:string[]}|null}
 */
export function normalizePresetEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const dado = String(entry.dado ?? '').trim();
    if (dado.length > MAX_FORMULA_LENGTH) return null;
    if (dado && !SAFE_FORMULA.test(dado)) return null;
    const fixed = Number(entry.fixo);
    const fixo = Number.isFinite(fixed) ? fixed : 0;
    const tipoAcao = normalizeToken(entry.tipoAcao);
    if (tipoAcao && !ACTION_KEYS.has(tipoAcao)) return null;
    const attrs = normalizeAttributes(entry.attrs);
    const tiposDano = normalizeDamageTypes(entry.tiposDano);
    const hasContent = Boolean(dado) || fixo !== 0 || attrs.length > 0 || tiposDano.length > 0;
    if (!hasContent) return null;
    const rawIndex = Number(entry.attackIndex);
    const attackIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
    return {
        tipoAcao,
        dado,
        fixo,
        attrs,
        tiposDano,
        ...(attackIndex !== null ? { attackIndex } : {}),
    };
}

/**
 * Normaliza um preset completo. Retorna null se inválido.
 * @param {object} preset
 * @returns {{id:string,name:string,group:string,entries:object[]}|null}
 */
export function normalizeDamagePreset(preset) {
    if (!preset || typeof preset !== 'object') return null;
    const name = String(preset.name ?? '').trim().slice(0, MAX_NAME_LENGTH);
    if (!name) return null;
    const group = presetGroupKey(preset.group);
    const sourceEntries = Array.isArray(preset.entries) ? preset.entries : [];
    if (sourceEntries.length === 0 || sourceEntries.length > MAX_PRESET_ENTRIES) return null;
    const entries = sourceEntries.map((entry) => normalizePresetEntry(entry));
    if (entries.some((entry) => !entry)) return null;
    const resourceCost = Math.max(0, Math.trunc(Number(preset.resourceCost) || 0));
    const breathing =
        String(preset.breathing ?? '')
            .trim()
            .slice(0, MAX_BREATHING_LENGTH) || presetGroupLabel(group);
    return { id: String(preset.id ?? presetId()), name, group, breathing, resourceCost, entries };
}

/**
 * Lê o valor persistido e devolve `{ version, presets }`.
 * @param {string|object} raw
 * @returns {{version:number,presets:object[]}}
 */
export function parseDamagePresets(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw || '{}');
        } catch (_) {
            return { version: DAMAGE_PRESETS_VERSION, presets: [] };
        }
    }
    if (Array.isArray(parsed)) return { version: DAMAGE_PRESETS_VERSION, presets: parsed };
    const presets = Array.isArray(parsed?.presets) ? parsed.presets : [];
    return { version: DAMAGE_PRESETS_VERSION, presets };
}

/**
 * Presets de um grupo (aceita rótulo ou chave).
 * @param {object[]} presets
 * @param {string} group
 * @returns {object[]}
 */
export function presetsForGroup(presets, group) {
    const wanted = presetGroupKey(group);
    return (Array.isArray(presets) ? presets : []).filter(
        (preset) => presetGroupKey(preset?.group) === wanted
    );
}

/**
 * Agrupa presets para a UI: grupos conhecidos na ordem canônica, depois os
 * grupos livres em ordem alfabética.
 * @param {object[]} presets
 * @returns {{key:string,label:string,presets:object[]}[]}
 */
export function groupedPresets(presets) {
    const list = Array.isArray(presets) ? presets : [];
    const buckets = new Map();
    for (const preset of list) {
        const key = presetGroupKey(preset?.group);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(preset);
    }
    const groups = [];
    for (const known of PRESET_GROUPS) {
        const bucket = buckets.get(known.key);
        if (bucket?.length) {
            groups.push({ key: known.key, label: known.label, presets: bucket });
            buckets.delete(known.key);
        }
    }
    for (const key of [...buckets.keys()].sort((left, right) => left.localeCompare(right, 'pt-BR')))
        groups.push({ key, label: key, presets: buckets.get(key) });
    return groups;
}

/**
 * Insere ou atualiza um preset. Preset inválido ou limite excedido não grava.
 * @param {string|object} raw
 * @param {object} preset
 * @returns {{ok:boolean,presets:object[],reason?:string}}
 */
export function upsertDamagePreset(raw, preset) {
    const store = parseDamagePresets(raw);
    const normalized = normalizeDamagePreset(preset);
    if (!normalized)
        return { ok: false, presets: store.presets, reason: 'Preset de dano inválido.' };
    const remaining = store.presets.filter(
        (entry) => String(entry?.id ?? '') !== normalized.id
    );
    if (remaining.length >= MAX_DAMAGE_PRESETS)
        return {
            ok: false,
            presets: store.presets,
            reason: `Limite de ${MAX_DAMAGE_PRESETS} presets atingido.`,
        };
    return { ok: true, presets: [...remaining, normalized] };
}

/**
 * Remove um preset pelo id.
 * @param {string|object} raw
 * @param {string} id
 * @returns {object[]}
 */
export function removeDamagePreset(raw, id) {
    const wanted = String(id ?? '');
    return parseDamagePresets(raw).presets.filter(
        (preset) => String(preset?.id ?? '') !== wanted
    );
}

/**
 * Patch de Actor para persistir a lista de presets.
 * @param {object[]} presets
 * @returns {Record<string,string>}
 */
export function damagePresetsPatch(presets) {
    return {
        [`system.props.${DAMAGE_PRESETS_KEY}`]: JSON.stringify({
            version: DAMAGE_PRESETS_VERSION,
            presets: Array.isArray(presets) ? presets : [],
        }),
    };
}
