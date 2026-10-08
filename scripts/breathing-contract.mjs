/**
 * @fileoverview Contrato único das Formas de Respiração.
 *
 * Forma é dado: o pipeline não conhece nenhuma Respiração pelo nome. Este
 * módulo normaliza o dado bruto (formatos atuais e canônico), resolve Forma e
 * nível e recusa dado inválido. Nenhum ramo por Forma mora aqui.
 */

import { TIPOS_DANO } from './constants.mjs';
import { FLAME_FORMS } from './flame-breathing-data.mjs';
import { STONE_FORMS } from './stone-breathing-data.mjs';
import { MIST_FORMS } from './mist-breathing-data.mjs';
import { SNOW_FORMS } from './snow-breathing-data.mjs';
import { METAL_FORMS } from './metal-breathing-data.mjs';
import { WIND_FORMS } from './wind-breathing-data.mjs';
import { WATER_BREATHING_FORMS } from './water-breathing-data.mjs';

export const CONTRACT_VERSION = 1;
export const MAX_FORMULA_LENGTH = 80;

/** Mesmo whitelist de fórmula usado pelos presets de dano. */
export const SAFE_FORMULA = /^[a-zA-Z0-9_\s+\-*/().,@]+$/u;

/**
 * Respirações já migradas para o pipeline canônico. Cresce uma por leva.
 * Enquanto não estiver aqui, a Respiração permanece na rota legada.
 */
export const MIGRATED_BREATHINGS = new Set(['Pedra']);

export function isMigrated(respiracao) {
    return MIGRATED_BREATHINGS.has(canonicalBreathing(respiracao));
}

const DAMAGE_TYPE_KEYS = new Set(TIPOS_DANO.map((type) => type.key));

const BREATHING_ALIASES = new Map([
    ['chamas', 'Chamas'],
    ['flame', 'Chamas'],
    ['pedra', 'Pedra'],
    ['stone', 'Pedra'],
    ['nevoa', 'Névoa'],
    ['mist', 'Névoa'],
    ['neve', 'Neve'],
    ['snow', 'Neve'],
    ['metal', 'Metal'],
    ['vento', 'Vento'],
    ['wind', 'Vento'],
    ['agua', 'Água'],
    ['water', 'Água'],
]);

function normalizeToken(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
}

/**
 * Nome canônico da Respiração (aceita rótulo com acento, romaji ou inglês).
 * @param {string} value
 * @returns {string}
 */
export function canonicalBreathing(value) {
    return BREATHING_ALIASES.get(normalizeToken(value)) ?? String(value ?? '').trim();
}

function normalizeDamageTypes(...candidates) {
    const seen = new Set();
    const output = [];
    for (const candidate of candidates) {
        const list = Array.isArray(candidate) ? candidate : [];
        for (const entry of list) {
            const key = normalizeToken(entry);
            if (!DAMAGE_TYPE_KEYS.has(key) || seen.has(key)) continue;
            seen.add(key);
            output.push(key);
        }
    }
    return output;
}

function validFormula(formula) {
    const text = String(formula ?? '').trim();
    if (!text) return true;
    if (text.length > MAX_FORMULA_LENGTH) return false;
    return SAFE_FORMULA.test(text);
}

function normalizeLevel(raw, context) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'object') return null;
    let custo;
    if (raw.custo !== undefined || raw.cost !== undefined) {
        const value = Number(raw.custo ?? raw.cost);
        if (!Number.isFinite(value) || value < 0) return null;
        custo = value;
    } else {
        return null;
    }
    const dano = String(raw.dano ?? raw.damage ?? '').trim();
    if (!validFormula(dano)) return null;
    const tiposDano = normalizeDamageTypes(raw.tiposDano, raw.damageTypes, raw.types, context.types);
    const bonusAcertoRaw = Number(raw.bonusAcerto ?? raw.hitBonus ?? 0);
    const bonusAcerto = Number.isFinite(bonusAcertoRaw) ? bonusAcertoRaw : 0;
    const texto = String(raw.texto ?? raw.effect ?? '').trim();
    const primitivas = Array.isArray(raw.primitivas) ? raw.primitivas : [];
    return { custo, dano, tiposDano, bonusAcerto, texto, primitivas };
}

/**
 * Normaliza o dado bruto de uma Forma para o shape canônico.
 * @param {object} raw
 * @param {string} respiracao
 * @returns {object|null}
 */
export function normalizeForm(raw, respiracao) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '').trim();
    if (!id) return null;
    const brea = canonicalBreathing(respiracao ?? raw.respiracao);
    if (!brea) return null;
    const levels = Array.isArray(raw.niveis)
        ? raw.niveis
        : Array.isArray(raw.levels)
          ? raw.levels
          : [];
    const niveis = [0, 1, 2, 3].map((index) =>
        normalizeLevel(levels[index] ?? null, { types: raw.damageTypes })
    );
    if (levels.length > 0 && niveis.every((entry) => entry === null) && raw.passive !== true) {
        const anyLevelObject = levels.some((entry) => entry && typeof entry === 'object');
        if (anyLevelObject) return null;
    }
    const acoes = Array.isArray(raw.acoes)
        ? raw.acoes.map(String)
        : Array.isArray(raw.actions)
          ? raw.actions.map(String)
          : raw.acao ?? raw.action
            ? [String(raw.acao ?? raw.action)]
            : [];
    const acao = raw.acao ?? raw.action ?? acoes[0] ?? null;
    const passiva = raw.passive === true || acao === 'passiva';
    const feedsUsarRaw = raw.feedsUsar ?? {};
    const feedsAcertoRaw = raw.feedsAcerto ?? {};
    return {
        id,
        respiracao: brea,
        estilo: raw.estilo ?? raw.style ?? raw.order ?? null,
        nome: String(raw.nome ?? raw.name ?? '').trim(),
        ptName: String(raw.ptName ?? '').trim(),
        acao,
        acoes,
        passiva,
        semAcerto: raw.semAcerto === true || raw.noHitRoll === true,
        feedsUsar: {
            weaponHeat: Number(feedsUsarRaw.weaponHeat ?? raw.weaponHeat ?? 0) || 0,
            enemyHeat: Number(feedsUsarRaw.enemyHeat ?? 0) || 0,
            freeze: Number(feedsUsarRaw.freeze ?? 0) || 0,
            bleeding: Number(feedsUsarRaw.bleeding ?? 0) || 0,
            grantPattern: feedsUsarRaw.grantPattern ?? null,
        },
        feedsAcerto: {
            weaponHeat: Number(feedsAcertoRaw.weaponHeat ?? 0) || 0,
            enemyHeat: Number(feedsAcertoRaw.enemyHeat ?? raw.enemyHeat ?? 0) || 0,
            freeze: Number(feedsAcertoRaw.freeze ?? 0) || 0,
            bleeding: Number(feedsAcertoRaw.bleeding ?? 0) || 0,
            grantPattern: feedsAcertoRaw.grantPattern ?? null,
        },
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        niveis,
    };
}

const REGISTRY = new Map([
    ['Chamas', FLAME_FORMS],
    ['Pedra', STONE_FORMS],
    ['Névoa', MIST_FORMS],
    ['Neve', SNOW_FORMS],
    ['Metal', METAL_FORMS],
    ['Vento', WIND_FORMS],
    ['Água', WATER_BREATHING_FORMS],
]);

/**
 * Catálogo bruto registrado para uma Respiração.
 * @param {string} respiracao
 * @returns {object[]}
 */
export function rawFormsFor(respiracao) {
    return REGISTRY.get(canonicalBreathing(respiracao)) ?? [];
}

/**
 * Resolve a Forma canônica pelo nome da Respiração + `forma_id` do item.
 * @param {string} respiracao
 * @param {string} formaId
 * @returns {object|null}
 */
export function resolveForm(respiracao, formaId) {
    const wanted = String(formaId ?? '').trim();
    if (!wanted) return null;
    const raw = rawFormsFor(respiracao).find((form) => String(form?.id ?? '') === wanted) ?? null;
    return raw ? normalizeForm(raw, respiracao) : null;
}

/**
 * Resolve o nível (1–4) de uma Forma canônica.
 * @param {object} form
 * @param {number} level
 * @returns {{ok:boolean, dados?:object, reason?:string}}
 */
export function resolveLevel(form, level) {
    const index = Math.trunc(Number(level));
    if (!form || !Number.isInteger(index) || index < 1 || index > 4)
        return { ok: false, reason: `Nível de respiração inválido: ${level}.` };
    const dados = form.niveis?.[index - 1] ?? null;
    if (!dados)
        return { ok: false, reason: `Esta Forma não pode ser usada no Nível de Respiração ${index}.` };
    return { ok: true, dados };
}