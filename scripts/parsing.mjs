/**
 * @fileoverview Parsing e utilitários defensivos para valores CSB.
 */

import { ATTRIBUTES } from "./constants.mjs";

/**
 * Extrai um número de um valor cru, tolerando HTML, &nbsp; e vírgula decimal.
 * @param {unknown} raw
 * @returns {number}
 */
export function parseNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Alias semântico para valores de atributo finais (podem vir como Label HTML).
 * @param {unknown} raw
 * @returns {number}
 */
export function parseAttributeValue(raw) {
  return parseNumber(raw);
}

/**
 * Normaliza nível aceitando 6, "6" ou "nvl_6".
 * @param {unknown} raw
 * @returns {number}
 */
export function parseLevel(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw ?? "").trim().toLowerCase();
  const m = s.match(/^nvl[_\s]?(\d+)$/);
  if (m) return Number(m[1]);
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Verifica se uma option key ou label corresponde à Marca do Destino.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDestinyMark(value) {
  const normalized = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return (
    normalized.includes("hab_escolhida_marca_destino") ||
    normalized.includes("marca do destino")
  );
}

/**
 * Normaliza option key de habilidade, aceitando fallback por label.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeAbilityKey(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("hab_escolhida_")) return s;
  const normalized = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  // Fallback por label (migração)
  const map = {
    "escolha": "hab_escolhida_base",
    "sem habilidade": "hab_escolhida_sem",
    "tato sensitivo": "hab_escolhida_tato",
    "audicao sobrenatural": "hab_escolhida_audicao",
    "visao agucada": "hab_escolhida_visao",
    "olfato sobrenatural": "hab_escolhida_olfato",
    "metamorfose carnivora": "hab_escolhida_metamorfose",
    "tsuyoi — o inabalavel": "hab_escolhida_tsuyoi",
    "tsuyoi o inabalavel": "hab_escolhida_tsuyoi",
    "tsuyoi - o inabalavel": "hab_escolhida_tsuyoi",
    "marechi — o sangue raro": "hab_escolhida_marechi",
    "marechi o sangue raro": "hab_escolhida_marechi",
    "marechi - o sangue raro": "hab_escolhida_marechi",
    "oketsu — o sangue real": "hab_escolhida_oketsu",
    "oketsu o sangue real": "hab_escolhida_oketsu",
    "oketsu - o sangue real": "hab_escolhida_oketsu",
    "marca do destino": "hab_escolhida_marca_destino",
  };
  return map[normalized] || null;
}

/**
 * Detecta se uma prop específica mudou no diff do updateActor.
 * Aceita os dois formatos de diff usados por integrações.
 * @param {object} changes
 * @param {string} key
 * @returns {unknown|undefined}
 */
export function changedProp(changes, key) {
  if (Object.prototype.hasOwnProperty.call(changes?.system?.props ?? {}, key)) {
    return changes.system.props[key];
  }
  return changes?.[`system.props.${key}`];
}

/**
 * Verifica se dois arrays de números contêm os mesmos valores (multiset).
 * @param {number[]} values
 * @param {number[]} pool
 * @returns {boolean}
 */
export function poolMatches(values, pool) {
  const a = [...values].map(Number).sort((x, y) => x - y);
  const b = [...pool].map(Number).sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Retorna os valores mais recentes de snapshot anteriores a um nível,
 * ou fallback para atr_*_valor_config.
 * @param {object} props
 * @param {number} level
 * @returns {Record<string, number>}
 */
export function latestValues(props, level) {
  return Object.fromEntries(
    ATTRIBUTES.map((attribute) => {
      for (let previous = Math.min(20, level - 1); previous >= 1; previous -= 1) {
        const snapshot = props[`${attribute.key}_nvl${previous}`];
        if (snapshot !== undefined && snapshot !== null && snapshot !== "") {
          return [attribute.key, parseNumber(snapshot)];
        }
      }
      return [
        attribute.key,
        parseNumber(props[`atr_${attribute.key}_valor_config`]),
      ];
    })
  );
}

/**
 * Retorna os valores-base atuais a partir de atr_*_valor_config.
 * @param {object} props
 * @returns {Record<string, number>}
 */
export function currentConfigValues(props) {
  return Object.fromEntries(
    ATTRIBUTES.map((attribute) => [
      attribute.key,
      parseNumber(props[`atr_${attribute.key}_valor_config`]),
    ])
  );
}
