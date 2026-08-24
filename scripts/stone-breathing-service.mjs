import { parseNumber } from "./parsing.mjs";
import { stoneFormById } from "./stone-breathing-data.mjs";

export const STONE_STATE_KEY = "resp_pedra_estado";

export function parseStoneBreathingState(raw) {
  // structuredClone evita que objetos aninhados (resilience/bleeding/reflection/
  // pendingDamage/serpentine) fiquem compartilhados por referência entre o
  // estado de origem e a cópia retornada aqui — sem isso, tickStoneBreathing/
  // consumeStonePending mutariam o objeto original do chamador "por trás",
  // mesmo quando ele não passou por serialização JSON (mesmo padrão de
  // anti-aliasing usado em parseSnowBreathingState).
  if (raw && typeof raw === "object") return { version: 1, ...structuredClone(raw) };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { version: 1, ...parsed } : { version: 1 };
  } catch (_) {
    return { version: 1 };
  }
}

export function stoneStatePatch(state, overrides = {}) {
  const resilience = state.resilience?.turns > 0
    ? `Resiliência ${state.resilience.turns} turno(s) · Resistência: Concussão, Cortante e Perfurante`
    : state.resilience?.untilCombatEnd
      ? "Resiliência até o fim do combate · Resistência: Concussão, Cortante e Perfurante"
    : "Pedra · sem efeito ativo";
  return {
    [`system.props.${STONE_STATE_KEY}`]: JSON.stringify({ version: 1, ...state }),
    "system.props.resp_pedra_resumo": resilience,
    "system.props.resp_pedra_resiliencia_turnos": Math.max(0, Math.trunc(parseNumber(state.resilience?.turns))),
    ...overrides,
  };
}

export function buildStoneBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = stoneFormById(formId);
  const selected = form?.levels?.[level - 1] ?? null;
  if (!form) return { ok: false, noCost: true, reason: "Forma da Pedra desconhecida." };
  if (!selected) return { ok: false, noCost: true, reason: `Esta forma não pode ser usada no Nível de Respiração ${level}.` };
  const state = parseStoneBreathingState(props[STONE_STATE_KEY]);
  if (form.oncePerCombat && state.resilienceUsed) {
    return { ok: false, noCost: true, reason: "Resiliência já foi usada neste combate." };
  }
  const strength = parseNumber(props.for_display);
  const dexterity = parseNumber(props.dex_display);
  const next = { ...state, activeForm: { id: form.id, level } };
  if (form.id === "pedra_01") {
    next.serpentine = {
      formula: selected.damage, damageTypes: selected.damageTypes, damageComponents: selected.damageComponents,
      saveAttribute: "VIT", saveDc: 10 + strength + Math.floor(Math.max(0, parseNumber(choices.originDamage)) / 10),
      requiresPriorHit: true, noHitRoll: true,
    };
  } else if (form.id === "pedra_02") {
    next.pendingDamage = { source: form.id, formula: selected.damage, uses: 1, technique: true, types: selected.damageTypes };
    next.bleeding = { amount: selected.bleeding, turns: selected.bleedingTurns, trigger: "on-hit" };
  } else if (form.id === "pedra_03") {
    const ranged = choices.weaponRange === "distancia";
    next.reflection = {
      attackPenalty: selected.attackPenaltyBase + (ranged ? dexterity : strength),
      attribute: ranged ? "DEX" : "FOR", blockBonus: selected.blockBonus ?? 0,
      blockTurns: selected.blockTurns ?? 0, counterAttack: selected.counterAttack === true,
      target: choices.targetUuid ?? "", allyTarget: choices.protectedUuid ?? choices.allyUuid ?? "",
    };
  } else if (form.id === "pedra_04") {
    next.nextHit = { source: form.id, count: selected.attacks };
    next.pendingDamage = {
      source: form.id, formula: selected.damage, formulas: Array(selected.attacks).fill(selected.damage),
      uses: selected.attacks, technique: true, types: selected.damageTypes,
      recoverPdrOnCritical: selected.recoverPdrOnCritical, recoverPdrMaximum: selected.recoverPdrOnCritical,
    };
  } else if (form.id === "pedra_05") {
    next.resilienceUsed = true;
    next.resilience = {
      turns: selected.turns,
      untilCombatEnd: false,
      resistances: selected.resistances,
      multiplier: 0.5,
    };
  }
  return {
    ok: true, form, selected, action: form.action ?? null, actions: form.actions ?? (form.action ? [form.action] : []),
    cost: selected.cost, state: next, patch: stoneStatePatch(next),
  };
}

export function buildStoneMarkReactivation(props = {}) {
  const state = parseStoneBreathingState(props[STONE_STATE_KEY]);
  if (!state.resilienceUsed || state.resilience?.untilCombatEnd === true) {
    return { eligible: false, ok: false, noCost: true };
  }

  const form = stoneFormById("pedra_05");
  const selected = form?.levels?.[0] ?? null;
  const cost = Math.max(0, parseNumber(selected?.cost));
  const maximum = Math.max(0,
    parseNumber(props.pdr_slayer_total_conta)
      + parseNumber(props.metal_slayer_pdr_bonus)
      + parseNumber(props.pdr_slayer_extra));
  const spent = Math.max(0, parseNumber(props.pdr_slayer_gasto_valor));
  const current = Math.max(0, Math.min(maximum,
    maximum + parseNumber(props.pdr_slayer_curado) - spent));

  if (current < cost) {
    return {
      eligible: true,
      ok: false,
      noCost: true,
      cost,
      pdrCurrent: current,
      reason: `PDR insuficiente para reativar Resiliência (${current}/${cost}).`,
    };
  }

  const next = {
    ...state,
    resilienceUsed: true,
    resilience: {
      turns: null,
      untilCombatEnd: true,
      resistances: selected?.resistances ?? ["concussao", "cortante", "perfurante"],
      multiplier: 0.5,
    },
  };
  return {
    eligible: true,
    ok: true,
    cost,
    pdrCurrent: current,
    state: next,
    patch: stoneStatePatch(next, {
      "system.props.pdr_slayer_gasto_valor": spent + cost,
    }),
  };
}

export function consumeStonePending(state, { hit = false, damage = false } = {}) {
  const next = { ...parseStoneBreathingState(state) };
  if (hit) delete next.nextHit;
  if (damage && next.pendingDamage) {
    const formulas = Array.isArray(next.pendingDamage.formulas) ? next.pendingDamage.formulas.slice(1) : [];
    const uses = Math.max(0, Math.trunc(parseNumber(next.pendingDamage.uses) || 1) - 1);
    if (uses > 0) next.pendingDamage = { ...next.pendingDamage, uses, formulas, formula: formulas[0] ?? next.pendingDamage.formula };
    else delete next.pendingDamage;
  }
  return next;
}

export function tickStoneBreathing(raw) {
  const state = parseStoneBreathingState(raw);
  if (state.resilience && Number.isFinite(Number(state.resilience.turns))) {
    state.resilience.turns = Math.max(0, Math.trunc(parseNumber(state.resilience.turns)) - 1);
    if (state.resilience.turns === 0) delete state.resilience;
  }
  delete state.activeForm;
  if (state.reflection?.blockTurns > 0) {
    state.reflection.blockTurns -= 1;
    if (state.reflection.blockTurns <= 0) delete state.reflection;
  } else if (state.reflection) delete state.reflection;
  return { state, patch: stoneStatePatch(state) };
}

export function stoneReflectionPenalty(raw) {
  const reflection = parseStoneBreathingState(raw).reflection;
  return reflection ? -Math.max(0, Math.trunc(parseNumber(reflection.attackPenalty))) : 0;
}

export function consumeStoneCounterAttack(raw) {
  const state = parseStoneBreathingState(raw);
  const available = state.reflection?.counterAttack === true;
  if (available) state.reflection = { ...state.reflection, counterAttack: false };
  return { available, state, patch: stoneStatePatch(state) };
}

export function clearStoneBreathingState(raw) {
  const state = parseStoneBreathingState(raw);
  delete state.activeForm;
  delete state.nextHit;
  delete state.pendingDamage;
  delete state.serpentine;
  delete state.bleeding;
  delete state.reflection;
  delete state.resilience;
  delete state.resilienceUsed;
  return stoneStatePatch(state);
}
