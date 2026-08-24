import { parseNumber } from "./parsing.mjs";
import { flameFormById, flameWeaponTier } from "./flame-breathing-data.mjs";

export const FLAME_STATE_KEY = "resp_chamas_estado";
export const FLAME_HEAT_FLAG = "flameHeat";

export function parseFlameBreathingState(raw) {
  if (raw && typeof raw === "object") return { version: 1, weaponHeat: 0, ...raw };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { version: 1, weaponHeat: 0, ...parsed } : { version: 1, weaponHeat: 0 };
  } catch (_) {
    return { version: 1, weaponHeat: 0 };
  }
}

export function flameStatePatch(state, overrides = {}) {
  const tier = flameWeaponTier(state.weaponHeat);
  const summary = `Fogo Fátuo ${tier.heat}/60 · Acerto +${tier.hit} · Dano +${tier.weaponDamage}${tier.techniqueDie ? ` · Técnicas +${tier.techniqueDie}` : ""}${tier.multiplier > 1 ? " · Dano ×1,5" : ""}`;
  return {
    [`system.props.${FLAME_STATE_KEY}`]: JSON.stringify({ version: 1, ...state, weaponHeat: tier.heat }),
    "system.props.resp_chamas_calor_arma": tier.heat,
    "system.props.resp_chamas_bonus_acerto": tier.hit,
    "system.props.resp_chamas_bonus_dano": tier.weaponDamage,
    "system.props.resp_chamas_bonus_dado": tier.techniqueDie,
    "system.props.resp_chamas_resumo": summary,
    ...overrides,
  };
}

export function buildFlameBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = flameFormById(formId);
  const selected = form?.levels?.[level - 1] ?? null;
  if (!form) return { ok: false, noCost: true, reason: "Forma das Chamas desconhecida." };
  if (form.passive) return { ok: false, noCost: true, reason: "Esquentar é uma passiva e não consome ação ou PDR." };
  if (!selected) return { ok: false, noCost: true, reason: `Esta forma não pode ser usada no Nível de Respiração ${level}.` };

  const state = parseFlameBreathingState(props[FLAME_STATE_KEY]);
  const currentHeat = Math.max(state.weaponHeat, parseNumber(props.resp_chamas_calor_arma));
  if (currentHeat < (form.minimumWeaponHeat ?? 0)) {
    return { ok: false, noCost: true, reason: `Cauterizar exige ao menos ${form.minimumWeaponHeat} Pontos de Esquentar na arma.` };
  }

  // Fila de efeitos pendentes da 1ª Forma: cada efeito tem identidade e ciclo
  // próprio (available → armed → used/consumed), então efeitos diferentes
  // nunca se sobrescrevem — mesmo com técnicas encadeadas no mesmo turno.
  const pendingEffects = normalizeFlamePendingEffects(state);
  const mainEffect = pendingEffects.find((effect) => effect.id === FLAME_EFFECT_MAIN);
  const extraEffect = pendingEffects.find((effect) => effect.id === FLAME_EFFECT_EXTRA_ATTACK);
  // Rider armado do ataque adicional esperando resolução NÃO é combo:
  // não pode vazar como bônus da nova técnica.
  const armedExtraIncoming = state.pendingDamage?.extraAttackArmed === true;
  const preparedRider = !armedExtraIncoming
    && state.pendingDamage?.source === "chamas_02"
    && formId !== "chamas_02"
    ? state.pendingDamage
    : null;
  const weaponHeat = Math.min(60, currentHeat + (form.weaponHeat ?? 0));
  const tier = flameWeaponTier(weaponHeat);
  const next = { ...state, weaponHeat, activeForm: { id: form.id, level, enemyHeat: form.enemyHeat ?? 0 }, pendingEffects };
  const pendingHit = {};
  const pendingDamage = {};

  if (form.id === "chamas_02") {
    const formulas = [selected.damage];
    if (selected.extraAttackDamage) formulas.push(selected.extraAttackDamage);
    Object.assign(pendingDamage, { source: form.id, formula: formulas[0], formulas, uses: formulas.length, technique: true });
    Object.assign(pendingHit, { source: form.id, count: 1 + (selected.extraAttacks ?? 0) });
    // Renova as entradas da fila para esta ativação da 1ª Forma
    for (const [index, id] of [FLAME_EFFECT_MAIN, FLAME_EFFECT_EXTRA_ATTACK].entries()) {
      const existingIndex = pendingEffects.findIndex((entry) => entry.id === id);
      if (existingIndex >= 0) pendingEffects.splice(existingIndex, 1);
      if (id === FLAME_EFFECT_MAIN || (selected.extraAttacks ?? 0) > 0) {
        pendingEffects.push({
          id,
          kind: id === FLAME_EFFECT_MAIN ? "rider_damage" : "extra_standard_attack",
          source: "chamas_01",
          formula: selected.damage,
          damageBonus: selected.extraAttackDamage ?? "",
          expires: "endOfTurn",
        });
      }
    }
    next.flameOne = { level, extraAttackDamage: selected.extraAttackDamage ?? "" };
  }
  if (form.id === "chamas_03") {
    Object.assign(pendingHit, { source: form.id, bonus: (currentHeat >= 10 ? 2 : 0) + (selected.hitBonus ?? 0), count: 1 });
    Object.assign(pendingDamage, { source: form.id, critical: selected.criticalOnHit === true, uses: 1, technique: true, blockPenalty: selected.blockPenalty ?? 0, blockPenaltyTurns: selected.blockPenaltyTurns ?? 0 });
  }
  if (form.id === "chamas_04") next.block = { source: form.id, bonus: selected.blockBonus, intercept: weaponHeat >= 30 };
  if (form.id === "chamas_05") {
    Object.assign(pendingHit, { source: form.id, count: 1, advantage: weaponHeat >= 30 });
    Object.assign(pendingDamage, { source: form.id, formula: selected.damage, uses: 1, technique: true, exhaustionOverDamage: selected.exhaustionOverDamage ?? 0 });
  }
  if (form.id === "chamas_06") {
    Object.assign(pendingHit, { source: form.id, count: 1, area: true });
    Object.assign(pendingDamage, { source: form.id, formula: selected.damage, uses: 1, technique: true, areaMeters: selected.areaMeters, evasionDc: selected.evasionDc, halfOnSave: true, damagePerEnemyHeat: selected.damagePerEnemyHeat ?? "" });
  }
  if (form.id === "chamas_07") next.healing = { source: form.id, formula: selected.healing, removeBleeding: selected.removeBleeding === true };
  if (form.id === "chamas_08") next.ignition = { source: form.id, turns: selected.turns, damageBonus: selected.damageBonus, selfDamage: selected.selfDamage };
  if (form.id === "chamas_09") {
    Object.assign(pendingHit, { source: form.id, bonus: selected.hitBonus, count: 1 });
    const rengokuAllies = Array.isArray(choices.rengokuAllies) ? choices.rengokuAllies : [];
    Object.assign(pendingDamage, { source: form.id, uses: 1, technique: true, rengoku: true, saveDc: selected.saveBaseDc + parseNumber(props.car_display), vulnerableOnFail: true, exhaustionOnHit: selected.exhaustionOnHit ?? 0, rengokuAllies: rengokuAllies.length });
    next.rengokuAllies = alliesUuids(rengokuAllies);
  }

  if (preparedRider && Object.keys(pendingDamage).length > 0) {
    pendingDamage.comboRider = { formula: preparedRider.formula, level: mainEffect?.level ?? 1 };
  }
  // Espelho de compatibilidade do ataque adicional da 1ª Forma
  if (formId !== "chamas_02" && extraEffect && !extraEffect.used) {
    next.flameOne = {
      level: mainEffect?.level ?? extraEffect.level ?? 1,
      extraAttackDamage: extraEffect.damageBonus ?? "",
      extraAttackAvailable: !extraEffect.armed,
      ...(extraEffect.armed ? { extraAttackConsumed: true } : {}),
    };
  }

  if (Object.keys(pendingHit).length) next.nextHit = pendingHit;
  if (Object.keys(pendingDamage).length) next.pendingDamage = pendingDamage;
  return { ok: true, form, selected, action: form.action, cost: selected.cost, state: next, tier, patch: flameStatePatch(next) };
}

function alliesUuids(allies = []) {
  return allies.map((ally) => String(ally.uuid ?? ally)).filter(Boolean);
}

export function addFlameEnemyHeat(raw, sourceId, amount) {
  const state = raw && typeof raw === "object" ? structuredClone(raw) : {};
  const key = String(sourceId || "unknown");
  const previous = Math.max(0, Math.min(60, Math.trunc(Number(state[key]?.heat) || 0)));
  const heat = Math.max(0, Math.min(60, previous + Math.max(0, Math.trunc(Number(amount) || 0))));
  const thresholds = [5, 10, 20, 30, 40, 50, 60].filter((value) => previous < value && heat >= value);
  state[key] = { heat, thresholds: [...new Set([...(state[key]?.thresholds ?? []), ...thresholds])] };
  return { state, previous, heat, thresholds };
}

export const FLAME_EFFECT_MAIN = "unknown_fire_main";
export const FLAME_EFFECT_EXTRA_ATTACK = "unknown_fire_extra_attack";

/**
 * Normaliza/migra a fila de efeitos pendentes da 1ª Forma.
 * Estados legados (flameOne + pendingDamage sem fila) são convertidos
 * para entradas de fila sem perda — mundos antigos continuam funcionando.
 */
function normalizeFlamePendingEffects(state) {
  const effects = Array.isArray(state.pendingEffects)
    ? state.pendingEffects.filter((entry) => entry && typeof entry.id === "string")
    : [];
  const active = (id) => effects.find((entry) => entry.id === id && !entry.used && !entry.consumed);
  if (state.pendingDamage?.source === "chamas_02" && !active(FLAME_EFFECT_MAIN) && !effects.some((entry) => entry.id === FLAME_EFFECT_MAIN)) {
    effects.push({
      id: FLAME_EFFECT_MAIN,
      kind: "rider_damage",
      source: "chamas_01",
      formula: String(state.pendingDamage.formula ?? ""),
      level: Number(state.flameOne?.level) || 1,
      expires: "endOfTurn",
    });
  }
  if (state.flameOne?.extraAttackAvailable && !state.flameOne?.extraAttackConsumed && !active(FLAME_EFFECT_EXTRA_ATTACK) && !effects.some((entry) => entry.id === FLAME_EFFECT_EXTRA_ATTACK)) {
    effects.push({
      id: FLAME_EFFECT_EXTRA_ATTACK,
      kind: "extra_standard_attack",
      source: "chamas_01",
      damageBonus: String(state.flameOne.extraAttackDamage ?? ""),
      expires: "endOfTurn",
    });
  }
  return effects;
}

export function consumeFlamePending(state, { hit = false, damage = false } = {}) {
  const next = { ...state };
  next.pendingEffects = normalizeFlamePendingEffects(next).map((entry) => ({ ...entry }));
  const mainEffect = next.pendingEffects.find((effect) => effect.id === FLAME_EFFECT_MAIN);
  const extraEffect = next.pendingEffects.find((effect) => effect.id === FLAME_EFFECT_EXTRA_ATTACK);
  if (hit) delete next.nextHit;
  if (damage && next.pendingDamage) {
    const slotSource = String(next.pendingDamage.source ?? "");
    const hadRider = Boolean(next.pendingDamage.comboRider);
    const wasArmedExtraSlot = next.pendingDamage.extraAttackArmed === true;
    const uses = Math.max(0, Math.trunc(Number(next.pendingDamage.uses) || 1) - 1);
    const formulas = Array.isArray(next.pendingDamage.formulas) ? next.pendingDamage.formulas.slice(1) : [];
    if (uses > 0) next.pendingDamage = { ...next.pendingDamage, uses, formulas, formula: formulas[0] ?? next.pendingDamage.formula };
    else delete next.pendingDamage;

    // Contabiliza qual efeito da fila foi consumido neste slot — e apenas ele.
    if (slotSource === "chamas_02") {
      if (mainEffect && !mainEffect.consumed) mainEffect.consumed = true;
      else if (extraEffect) extraEffect.used = true;
    } else {
      if (hadRider && mainEffect && !mainEffect.consumed) mainEffect.consumed = true;
      if (wasArmedExtraSlot && extraEffect) extraEffect.used = true;
    }
  }

  // Rearma o ataque padrão adicional da 1ª quando ele é devido e o slot está livre:
  // - logo após o consumo do rider principal (combo);
  // - ou quando um slot armado foi sobrescrito por outra técnica (encadeamento).
  if (extraEffect && !extraEffect.used && !next.pendingDamage
    && (extraEffect.armed || (mainEffect?.consumed && extraEffect.available !== false))) {
    extraEffect.armed = true;
    next.nextHit = { source: "chamas_02", count: 1 };
    if (extraEffect.damageBonus) {
      next.pendingDamage = { source: "chamas_02", formula: extraEffect.damageBonus, uses: 1, technique: true, extraAttackArmed: true };
    }
  }

  // Espelho de compatibilidade (flameOne) derivado da fila
  if (extraEffect) {
    next.flameOne = {
      ...(next.flameOne ?? {}),
      level: mainEffect?.level ?? next.flameOne?.level ?? 1,
      extraAttackDamage: extraEffect.damageBonus ?? "",
      extraAttackAvailable: !extraEffect.armed && !extraEffect.used,
      extraAttackConsumed: Boolean(extraEffect.armed || extraEffect.used),
    };
  }
  return next;
}

export function tickFlameBreathing(rawState) {
  const state = parseFlameBreathingState(rawState);
  const events = [];
  if (state.ignition?.turns > 0) {
    events.push({ type: "selfDamage", amount: state.ignition.selfDamage, damageType: "concussao", source: "Ignição" });
    state.ignition = { ...state.ignition, turns: state.ignition.turns - 1 };
    if (state.ignition.turns <= 0) delete state.ignition;
  }
  const tier = flameWeaponTier(state.weaponHeat);
  if (tier.selfDamage > 0) events.push({ type: "selfDamage", amount: tier.selfDamage, damageType: "concussao", source: "Fogo Fátuo 60" });
  delete state.activeForm;
  delete state.block;
  delete state.healing;
  delete state.flameOne;
  delete state.rengokuAllies;
  delete state.pendingEffects;
  // Pendentes da 1ª Forma valem somente até o fim do turno
  delete state.nextHit;
  delete state.pendingDamage;
  return { state, events, patch: flameStatePatch(state) };
}

export function clearFlameBreathingState() {
  return flameStatePatch({ version: 1, weaponHeat: 0 });
}

export const FLAME_SYNERGY_BREATHINGS = Object.freeze(["Amor", "Vento", "Magma", "Sol"]);
export const FLAME_SYNERGY_PDR_COST = 2;
export const FLAME_SYNERGY_DAMAGE_PER_ALLY = 5;

/**
 * Filtra candidatos a contribuir com a sinergia de aliados do Rengoku.
 * Puro — testável fora do Foundry. `candidates`: [{ uuid, name, respiracoes: string[], pdrAvailable }] .
 */
export function resolveFlameRengokuAllies(candidates = [], actorUuid = "") {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      uuid: String(candidate?.uuid ?? ""),
      name: String(candidate?.name ?? ""),
      respiracoes: Array.isArray(candidate?.respiracoes) ? candidate.respiracoes.map((entry) => String(entry)) : [],
      pdrAvailable: Math.max(0, Math.trunc(Number(candidate?.pdrAvailable) || 0)),
    }))
    .filter((candidate) => candidate.uuid
      && candidate.uuid !== String(actorUuid ?? "")
      && candidate.respiracoes.some((breathing) => FLAME_SYNERGY_BREATHINGS.includes(breathing))
      && candidate.pdrAvailable >= FLAME_SYNERGY_PDR_COST);
}

export function buildFlameInterception(stateOrRaw, { interceptorUuid = "", protectedUuid = "" } = {}) {
  const state = parseFlameBreathingState(stateOrRaw);
  const interceptor = String(interceptorUuid || "");
  const protectedActor = String(protectedUuid || "");
  if (!state.block?.intercept) return { ok: false, reason: "Ondulação ainda não permite interceptar.", state };
  if (!interceptor || !protectedActor || interceptor === protectedActor) return { ok: false, reason: "Escolha outro aliado para proteger.", state };
  state.block = { ...state.block, protectedUuid: protectedActor, interceptorUuid: interceptor, interceptionReady: true };
  return { ok: true, state, patch: flameStatePatch(state), flag: { interceptorUuid: interceptor, protectedUuid: protectedActor, turns: 1, source: "chamas_04" } };
}

export function consumeFlameInterception(flag, incomingTargetUuid) {
  if (!flag || Number(flag.turns) <= 0 || String(flag.protectedUuid || "") !== String(incomingTargetUuid || "")) return { intercepted: false, interceptorUuid: "" };
  return { intercepted: true, interceptorUuid: String(flag.interceptorUuid || ""), clearFlag: true };
}
