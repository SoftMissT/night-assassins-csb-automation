/**
 * @fileoverview Tabelas de custo do sistema de Kekkijutsu dos Onis.
 * Fonte: Guia de Criação de Kekkijutsu do Mestre.md
 * @module kekkijutsu-cost-tables
 */

export const ONI_SCALES = Object.freeze([
  "minion", "oni_comum", "elite", "subchefe",
  "boss_missao", "boss_arco", "boss_campanha",
  "lua_inferior", "lua_superior", "rei_oni",
]);

export const SCALE_LABELS = Object.freeze({
  minion: "Minion", oni_comum: "Oni Comum", elite: "Elite",
  subchefe: "Subchefe", boss_missao: "Boss de Missão",
  boss_arco: "Boss de Arco", boss_campanha: "Boss de Campanha",
  lua_inferior: "Lua Inferior", lua_superior: "Lua Superior", rei_oni: "Rei Oni",
});

export const SCALE_CD_BONUS = Object.freeze({
  minion: 0, oni_comum: 0, elite: 1, subchefe: 1,
  boss_missao: 2, boss_arco: 2, boss_campanha: 3,
  lua_inferior: 3, lua_superior: 4, rei_oni: 5,
});

export function calculateCD(attributeValue, scale, bonus = 0) {
  return 10 + Math.max(0, Math.trunc(attributeValue || 0)) + (SCALE_CD_BONUS[scale] ?? 0) + Math.max(0, Math.trunc(bonus || 0));
}

export const FERIDAS_DOMINANTES = Object.freeze([
  "ira_odio", "inveja_rancor", "medo_obsessao", "tristeza_vazio",
  "arrogancia", "gula_desejo", "vergonha_rejeicao", "luto_apego", "outra",
]);

export const FERIDA_LABELS = Object.freeze({
  ira_odio: "Ira / Ódio", inveja_rancor: "Inveja / Rancor",
  medo_obsessao: "Medo / Obsessão", tristeza_vazio: "Tristeza / Vazio",
  arrogancia: "Arrogância", gula_desejo: "Gula / Desejo",
  vergonha_rejeicao: "Vergonha / Rejeição", luto_apego: "Luto / Apego", outra: "Outra",
});

export const KEKKIJUTSU_FUNCTIONS = Object.freeze([
  "dano", "controle", "pressao", "debuff", "mobilidade",
  "defesa", "anticura", "invocacao", "ilusao", "campo", "dominio",
]);

export const FUNCAO_LABELS = Object.freeze({
  dano: "Dano", controle: "Controle", pressao: "Pressão",
  debuff: "Debuff", mobilidade: "Mobilidade", defesa: "Defesa",
  anticura: "Anticura", invocacao: "Invocação", ilusao: "Ilusão",
  campo: "Campo", dominio: "Domínio",
});

export const ACTION_TYPES = Object.freeze([
  "ataque", "especial", "movimento", "reacao", "completa",
  "unica", "lendaria", "covil", "vilao",
]);

export const ACTIONS_BY_SCALE = Object.freeze({
  minion: new Set(["ataque", "especial"]),
  oni_comum: new Set(["ataque", "especial", "movimento"]),
  elite: new Set(["ataque", "especial", "movimento", "reacao"]),
  subchefe: new Set(["ataque", "especial", "movimento", "reacao"]),
  boss_missao: new Set(["ataque", "especial", "movimento", "reacao", "completa"]),
  boss_arco: new Set(["ataque", "especial", "movimento", "reacao", "completa", "vilao"]),
  boss_campanha: new Set(["ataque", "especial", "movimento", "reacao", "completa", "unica", "vilao", "lendaria"]),
  lua_inferior: new Set(["ataque", "especial", "movimento", "reacao", "completa", "vilao", "covil"]),
  lua_superior: new Set(["ataque", "especial", "movimento", "reacao", "completa", "unica", "vilao", "lendaria", "covil"]),
  rei_oni: new Set(["ataque", "especial", "movimento", "reacao", "completa", "unica", "vilao", "lendaria", "covil"]),
});

const DAMAGE_BASE_COST = Object.freeze({
  cortante:    { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 },
  perfurante:  { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 },
  concussao:   { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 },
  sonico:      { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  trovejante:  { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  necrotico:   { d4: 3, d6: 4, d8: 5, d10: 6, d12: 8 },
  ferida:      { d4: 3, d6: 4, d8: 5, d10: 6, d12: 8 },
  acido:       { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  congelante:  { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  eletrico:    { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  fogo:        { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
  impacto:     { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 },
  mental:      { d4: 3, d6: 4, d8: 5, d10: 6, d12: 8 },
  solar:       { d4: 4, d6: 5, d8: 7, d10: 8, d12: 10 },
  venenoso:    { d4: 2, d6: 3, d8: 4, d10: 5, d12: 7 },
});

export function calculateDamageCost(dice, type) {
  const match = String(dice).match(/(\d+)d(\d+)/i);
  if (!match) return { baseCost: 0, additionalDice: 0, totalCost: 0 };
  const count = Math.max(1, Math.trunc(Number(match[1]) || 1));
  const face = `d${match[2]}`;
  const table = DAMAGE_BASE_COST[type] ?? DAMAGE_BASE_COST.cortante;
  const baseCost = table[face] ?? 1;
  const additionalDice = Math.max(0, count - 1);
  return { baseCost, additionalDice, totalCost: baseCost + additionalDice };
}

export function totalDamageCost(damageComponents) {
  return (damageComponents ?? []).reduce((sum, d) => sum + calculateDamageCost(d.dice, d.type).totalCost, 0);
}

const STATUS_DURATION_COST = Object.freeze({
  resistencia:         { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6 },
  medo:                { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6 },
  vulnerabilidade:     { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 },
  restricao_movimento: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 },
  exaustao:            { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 },
  atordoamento:        { 1: 3, 2: 4, 3: 6, 4: 8, 5: 9 },
  invisibilidade:      { 1: 3, 2: 4, 3: 6, 4: 8, 5: 9 },
  dominio:             { 1: 4, 2: 5, 3: 7, 4: 9, 5: 10 },
  regeneracao_ativa:   { 1: 4, 2: 5, 3: 7, 4: 9, 5: 10 },
});

export function calculateStatusCost(statusType, duration) {
  const table = STATUS_DURATION_COST[statusType];
  if (!table) return 0;
  const turns = Math.min(5, Math.max(1, Math.trunc(duration || 1)));
  return table[turns] ?? 0;
}

export function totalStatusCost(statusEffects) {
  return (statusEffects ?? []).reduce((sum, s) => sum + calculateStatusCost(s.type, s.duration), 0);
}

export const LIMITATION_DISCOUNTS = Object.freeze({
  requires_injured_target: -1,
  requires_bleeding_poisoned: -1,
  requires_preparation: -1,
  melee_only: -1,
  once_per_combat: -2,
  once_per_scene: -3,
  failure_consumes_pdk: -1,
  damages_self: -1,
  damages_self_strong: -3,
});

export function calculateTotalCost({ damageCost = 0, statusCost = 0, additionalTargetCost = 0, areaCost = 0, unusualActionCost = 0, durationCost = 0, hybridizationCost = 0, limitations = [] } = {}) {
  const discount = limitations.reduce((sum, key) => sum + (LIMITATION_DISCOUNTS[key] ?? 0), 0);
  return Math.max(1, damageCost + statusCost + additionalTargetCost + areaCost + unusualActionCost + durationCost + hybridizationCost + discount);
}

export const SCALE_LIMITS = Object.freeze({
  minion:            { maxCost: 3, maxDamage: "1d8", maxStatus: "leve_1turno", hasDomain: false, hasLegendary: false, hasLair: false, hasVillain: false },
  oni_comum:         { maxCost: 5, maxDamage: "2d6", maxStatus: "leve_medio_curto", hasDomain: false, hasLegendary: false, hasLair: false, hasVillain: false },
  elite:             { maxCost: 8, maxDamage: "3d6", maxStatus: "medio", hasDomain: false, hasLegendary: false, hasLair: false, hasVillain: false },
  subchefe:          { maxCost: 10, maxDamage: "4d6", maxStatus: "medio_forte", hasDomain: false, hasLegendary: false, hasLair: false, hasVillain: false },
  boss_missao:       { maxCost: 13, maxDamage: "4d10", maxStatus: "severo_contrajogo", hasDomain: "menor_condicional", hasLegendary: false, hasLair: false, hasVillain: false },
  boss_arco:         { maxCost: 16, maxDamage: "6d8", maxStatus: "severo", hasDomain: "maior", hasLegendary: false, hasLair: true, hasVillain: true },
  boss_campanha:     { maxCost: 20, maxDamage: "6d10", maxStatus: "severo_sistema", hasDomain: "maior", hasLegendary: true, hasLair: true, hasVillain: true },
  lua_inferior:      { maxCost: 18, maxDamage: "7d8", maxStatus: "severo", hasDomain: "menor_ou_maior", hasLegendary: false, hasLair: true, hasVillain: true },
  lua_superior:      { maxCost: 25, maxDamage: "8d10", maxStatus: "severo_recorrente", hasDomain: "superior", hasLegendary: true, hasLair: true, hasVillain: true },
  rei_oni:           { maxCost: 999, maxDamage: "variavel", maxStatus: "severo_regra_fase", hasDomain: "absoluto", hasLegendary: true, hasLair: true, hasVillain: true },
});

export const SPECIAL_DAMAGE_RULES = Object.freeze({
  trovejante: "Não pode ser reduzido por técnica ou Kekkijutsu. Pode ser anulado por cancelamento total.",
  sonico: "Não pode ser esquivado ou bloqueado normalmente. Alvo resiste com VIT para metade.",
  ferida: "Reduz PDV máximo. Não entra em Minion. Recorrente só para Boss, Lua ou Rei Oni.",
  necrotico: "Não pode ser curado/restaurado durante batalha. Exige descanso longo (mínimo 24h).",
  solar: "Oni não deve causar Dano Solar, salvo exceção narrativa extrema.",
  venenoso: "Aciona Sangramento, Hemorragia ou Envenenamento conforme fonte.",
});

export const RESISTANCE_MAP = Object.freeze({
  veneno_acido_doenca_corpo: "VIT",
  queda_empurrao_esmagamento: "FOR_ou_VIT",
  fios_armadilha_projetil_area: "DEX",
  ilusao_logica: "INT",
  engano_sensorial_eco_caca: "SAB",
  medo_comando_dominacao: "FDV",
  pressao_demoniaca: "FDV",
  tentacao_social: "CAR_ou_FDV",
});

export const WOUND_ATTRIBUTE_MAP = Object.freeze({
  ira_odio: "FOR",
  inveja_rancor: "SAB",
  medo_obsessao: "FDV",
  tristeza_vazio: "INT",
  arrogancia: "CAR",
  gula_desejo: "VIT",
  vergonha_rejeicao: "DEX",
  luto_apego: "INT",
  outra: "FDV",
});

export const REGEN_ACTIVATION = Object.freeze({
  minLevel: 7,
  action: "completa",
  healFormula: "1d6+VIT",
  damageReduction: 0.2,
  forbiddenScales: ["minion"],
});
