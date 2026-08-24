const LEVEL_MIN = 1;
const LEVEL_MAX = 20;

const TITLES = Object.freeze([
  null,
  "Oni Recém-Transformado", "Oni Faminto", "Oni Sanguinário", "Oni Predador",
  "Oni Notório", "Oni Aberrante", "Candidato às Doze Kizuki", "Lua Inferior Seis",
  "Lua Inferior Cinco", "Lua Inferior Quatro", "Lua Inferior Três", "Lua Inferior Dois",
  "Lua Inferior Um", "Lua Superior Seis", "Lua Superior Cinco", "Lua Superior Quatro",
  "Lua Superior Três", "Lua Superior Dois", "Lua Superior Um", "Rei dos Onis",
]);

const RANDOM_PDV_DICE = Object.freeze({
  2: "1d4", 3: "1d4", 4: "1d6", 5: "1d6", 6: "1d6",
  7: "2d4", 8: "2d4", 9: "2d4", 10: "2d6", 11: "2d6", 12: "2d6",
});

const PDK_GAINS = Object.freeze({
  2: 4, 3: 4, 4: 6, 5: 6, 6: 6, 7: 8, 8: 8, 9: 20,
  10: 10, 11: 10, 12: 12, 13: 12, 14: 14, 15: 14, 16: 16,
  17: 16, 18: 18, 19: 20, 20: 50,
});

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function normalizeOniLevel(value) {
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, integer(value, LEVEL_MIN)));
}

export function oniRank(level) {
  const normalized = normalizeOniLevel(level);
  const band = normalized <= 6 ? "oni"
    : normalized === 7 ? "candidato"
      : normalized <= 13 ? "lua_inferior"
        : normalized <= 19 ? "lua_superior" : "rei_oni";
  return Object.freeze({ level: normalized, title: TITLES[normalized], band });
}

export function oniSpecializationRank(level) {
  const normalized = normalizeOniLevel(level);
  if (normalized >= 19) return "SS";
  if (normalized >= 16) return "S";
  if (normalized >= 12) return "A";
  if (normalized >= 7) return "B";
  if (normalized >= 3) return "C";
  return null;
}

export function oniKekkijutsuRank(level) {
  const normalized = normalizeOniLevel(level);
  if (normalized >= 18) return "SS";
  if (normalized >= 15) return "S";
  if (normalized >= 12) return "A";
  if (normalized >= 9) return "B";
  if (normalized >= 5) return "C";
  if (normalized >= 3) return "inicial";
  return null;
}

export function oniUnarmedProfile(level, style = "martial") {
  const normalized = normalizeOniLevel(level);
  const clawBite = style === "claw" || style === "bite" || style === "clawBite";
  const attribute = clawBite ? "DEX" : "FOR";
  let dice = "";
  if (normalized >= 20) dice = "6d10";
  else if (normalized >= 16) dice = "4d10";
  else if (normalized >= 13) dice = "3d8";
  else if (normalized >= 10) dice = "2d8";
  else if (normalized >= 7) dice = "2d6";
  else if (normalized >= 4) dice = "1d6";
  const base = dice || "2";
  return Object.freeze({
    style: clawBite ? "clawBite" : "martial",
    attribute,
    formula: `${base}+${attribute}`,
    supernatural: normalized >= 4,
  });
}

export function oniRegenerationProfile(level) {
  const normalized = normalizeOniLevel(level);
  if (normalized < 2) return Object.freeze({ available: false });
  const activeFormula = normalized >= 9 ? "2d4+VIT" : normalized >= 5 ? "1d6+VIT" : "1d4+VIT";
  return Object.freeze({
    available: true,
    activeFormula,
    allowedActions: normalized >= 9 ? ["unique", "special"] : ["special"],
    usesPerTurn: 1,
    blockedBySinceLastTurn: ["solar", "glicinia", "nichirin"],
    automaticStartTurnFormula: normalized >= 13 ? "VIT" : null,
    reattachAvailable: normalized >= 9,
    limbsRegrowNextTurn: normalized >= 17,
  });
}

export function oniLegendaryActions(level) {
  const normalized = normalizeOniLevel(level);
  if (normalized >= 19) return 3;
  if (normalized >= 17) return 2;
  return normalized >= 13 ? 1 : 0;
}

export function oniRandomPdvRequirements(level, persisted = {}) {
  const normalized = normalizeOniLevel(level);
  const required = [];
  const missing = [];
  let total = 0;
  for (let current = 2; current <= Math.min(normalized, 12); current += 1) {
    const key = `pdv_oni_ganho_nvl${current}`;
    const entry = { level: current, key, dice: RANDOM_PDV_DICE[current] };
    required.push(entry);
    const raw = persisted[key] ?? persisted[current];
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) missing.push(entry);
    else total += Math.trunc(value);
  }
  return Object.freeze({ total, required, missing, complete: missing.length === 0 });
}

/**
 * Lista os ganhos aleatórios de PDV (níveis 2–12) ainda não persistidos.
 * @param {number} level
 * @param {object} [persisted] Props do Actor (`pdv_oni_ganho_nvl{N}` ou índice).
 * @returns {object[]} Entradas `{level, key, dice}` pendentes.
 */
export function missingOniPdvGains(level, persisted = {}) {
  const normalized = normalizeOniLevel(level);
  return oniRandomPdvRequirements(normalized, persisted).missing;
}

/**
 * Rola e persiste os ganhos aleatórios de PDV (níveis 2–12) pendentes.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.level] Nível atual; usa `nvl_oni` das props quando omitido.
 * @param {boolean} [options.onlyMissing] Rola apenas ganhos pendentes (padrão).
 * @returns {Promise<{results: object[], total: number, complete: boolean}>}
 */
export async function rollOniPdvGain(actor, { level, onlyMissing = true } = {}) {
  if (!actor?.update) throw new Error("Actor inválido para rolar ganhos de PDV Oni.");
  const props = actor.system?.props ?? {};
  const normalized = normalizeOniLevel(level ?? props.nvl_oni ?? props.nvl_num ?? String(props.nvl_pj ?? "").replace(/^nvl_/, ""));
  const plan = onlyMissing
    ? missingOniPdvGains(normalized, props)
    : oniRandomPdvRequirements(normalized, {}).required;
  const results = [];
  const patch = {};
  for (const entry of plan) {
    let value = 0;
    let rollTotal = 0;
    try {
      const roll = await Roll.create(entry.dice).evaluate();
      rollTotal = Number(roll.total) || 0;
      value = Math.max(0, Math.trunc(rollTotal));
    } catch (error) {
      globalThis.ui?.notifications?.error?.(`Falha ao rolar ganho do nível ${entry.level}: ${error.message}`);
      continue;
    }
    patch[`system.props.${entry.key}`] = value;
    results.push({ level: entry.level, key: entry.key, dice: entry.dice, value, rollTotal });
  }
  if (results.length) await actor.update(patch, { naCsbAutomation: true });
  const total = results.reduce((sum, result) => sum + result.value, 0);
  const remaining = missingOniPdvGains(normalized, { ...props, ...Object.fromEntries(results.map((r) => [r.key, r.value])) });
  return { results, total, complete: remaining.length === 0 };
}

/**
 * Automação da vida do Oni: garante que TODOS os ganhos aleatórios de PDV
 * (níveis 2–12) até o nível atual existam no ledger do Actor.
 * Idempotente — ganhos já persistidos NUNCA são rerrolados; só preenche
 * faltantes (ex.: criação direta em nível alto ou subida de nível).
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.level] Nível explícito; senão deriva das props.
 * @returns {Promise<{needed: boolean, rolled: object[], total: number, complete: boolean}>}
 */
export async function ensureOniProgression(actor, { level } = {}) {
  if (!actor?.update) throw new Error("Actor inválido para progressão Oni.");
  const props = actor.system?.props ?? {};
  const normalized = normalizeOniLevel(level ?? props.nvl_oni ?? props.nvl_num ?? String(props.nvl_pj ?? "").replace(/^nvl_/, ""));
  if (!missingOniPdvGains(normalized, props).length) {
    return { needed: false, rolled: [], total: 0, complete: true };
  }
  const result = await rollOniPdvGain(actor, { level: normalized });
  return { needed: true, rolled: result.results, total: result.total, complete: result.complete };
}

function fixedPdvGain(level, vitality) {  if (level === 20) return 50 + (vitality * 5);
  if (level >= 16) return 40 + vitality;
  if (level >= 13) return 30 + vitality;
  return 0;
}

export function calculateOniResources({ level, originPdv = 0, originPdk = 0, vitality = 0, persistedPdvGains = {} } = {}) {
  const normalized = normalizeOniLevel(level);
  const vit = Math.max(0, integer(vitality));
  const random = oniRandomPdvRequirements(normalized, persistedPdvGains);
  let fixedPdv = 0;
  let pdkGained = 0;
  for (let current = 2; current <= normalized; current += 1) {
    fixedPdv += fixedPdvGain(current, vit);
    pdkGained += PDK_GAINS[current] ?? 0;
  }
  return Object.freeze({
    level: normalized,
    pdvMaximum: Math.max(0, integer(originPdv)) + random.total + fixedPdv,
    pdkMaximum: Math.max(0, integer(originPdk)) + pdkGained,
    randomPdvComplete: random.complete,
    missingPdvGains: random.missing,
    breakdown: Object.freeze({ originPdv: Math.max(0, integer(originPdv)), randomPdv: random.total, fixedPdv, originPdk: Math.max(0, integer(originPdk)), pdkGained }),
  });
}

export const ONI_LEVEL_LIMITS = Object.freeze({ minimum: LEVEL_MIN, maximum: LEVEL_MAX });
