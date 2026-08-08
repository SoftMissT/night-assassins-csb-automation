/**
 * @fileoverview Motor autoritativo de turnos, dano e Exaustão do Slayer.
 */

import { MODULE_ID, STATUS_SLAYER_DANO_CONTINUO } from "./constants.mjs";
import { parseNumber } from "./parsing.mjs";
import { formatStatusSummary, parseStatusState } from "./status-service.mjs";

const TURN_FLAG = "lastStatusTurn";
const resolvingExhaustion = new Set();

function primaryActiveGm() {
  return game.users?.filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function isPrimaryGm() {
  return game.user?.isGM && primaryActiveGm()?.id === game.user.id;
}

function statePatch(state) {
  return {
    "system.props.status_slayer_dados": JSON.stringify(state),
    "system.props.status_slayer_resumo": formatStatusSummary(state.active, state.exhaustion),
    "system.props.status_slayer_exaustao": state.exhaustion,
  };
}

function currentPdv(props = {}) {
  // Prefere as parcelas numéricas canônicas. Labels do CSB podem conter CSS
  // com outros números (font-size, weight etc.) e não são uma fonte segura.
  const computedTotal = props.pdv_slayer_total_conta;
  if (computedTotal !== undefined && computedTotal !== null && computedTotal !== "") {
    const wound = parseNumber(props.pdv_slayer_dano_ferida);
    const healed = parseNumber(props.pdv_slayer_curado);
    const extra = parseNumber(props.pdv_slayer_extra);
    const damage = parseNumber(props.pdv_slayer_dano_tomado);
    return Math.max(0, parseNumber(computedTotal) - wound + healed + extra - damage);
  }
  const computedCurrent = props.pdv_slayer_conta_atual;
  if (typeof computedCurrent === "number" && Number.isFinite(computedCurrent)) {
    return Math.max(0, computedCurrent);
  }
  const display = props.pdv_slayer_atual_valor_display;
  if (display !== undefined && display !== null && display !== "") {
    const withoutCss = String(display).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
    return Math.max(0, parseNumber(withoutCss));
  }
  const totalLabel = String(props.pdv_slayer_total_valor ?? "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const total = parseNumber(totalLabel);
  const wound = parseNumber(props.pdv_slayer_dano_ferida);
  const healed = parseNumber(props.pdv_slayer_curado);
  const extra = parseNumber(props.pdv_slayer_extra);
  const damage = parseNumber(props.pdv_slayer_dano_tomado);
  return Math.max(0, total - wound + healed + extra - damage);
}

export function resolveIncomingDamage(state, amount, { isAttack = true } = {}) {
  const base = Math.max(0, Math.trunc(Number(amount) || 0));
  const vulnerable = isAttack && ((state.active ?? []).includes("vulneravel") || state.exhaustion >= 6);
  return { damage: vulnerable ? base * 2 : base, vulnerable };
}

export async function applySlayerDamage(actor, amount, context = {}) {
  if (!actor?.update) throw new Error("Slayer inválido para receber dano.");
  const props = actor.system?.props ?? {};
  const state = parseStatusState(props.status_slayer_dados);
  state.exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  const components = Array.isArray(context.components) ? context.components : [];
  const requestedWound = components.filter((component) => Array.isArray(component.types) && component.types.includes("ferida"))
    .reduce((total, component) => total + Math.max(0, Math.trunc(Number(component.subtotal) || 0)), 0);
  const requested = Math.max(0, Math.trunc(Number(amount) || 0));
  const woundBase = Math.min(requested, requestedWound);
  const demonicBonus = context.isDemonic && state.active.includes("corrupcao") ? 2 : 0;
  const normalBase = requested - woundBase + demonicBonus;
  const normalResolution = resolveIncomingDamage(state, normalBase, context);
  const woundResolution = resolveIncomingDamage(state, woundBase, context);
  const resolution = {
    damage: normalResolution.damage,
    woundDamage: woundResolution.damage,
    vulnerable: normalResolution.vulnerable || woundResolution.vulnerable,
  };
  const currentDamage = parseNumber(props.pdv_slayer_dano_tomado);
  const currentWounds = parseNumber(props.pdv_slayer_dano_ferida);
  const removable = new Set(["confuso", "distraido", "sonhando"]);
  const removed = resolution.damage + resolution.woundDamage > 0 ? state.active.filter((key) => removable.has(key)) : [];
  if (removed.length) {
    state.active = state.active.filter((key) => !removable.has(key));
    for (const key of removed) delete state.effects[key];
  }
  await actor.update({
    "system.props.pdv_slayer_dano_tomado": currentDamage + resolution.damage,
    "system.props.pdv_slayer_dano_ferida": currentWounds + resolution.woundDamage,
    ...statePatch(state),
  }, { naCsbAutomation: true, naStatusDamage: true });
  return {
    ...resolution,
    normalDamage: resolution.damage,
    removed,
    totalDamage: currentDamage + resolution.damage,
    woundTotal: currentWounds + resolution.woundDamage,
    actorName: actor.name,
  };
}

function repeatedFormula(formula, stacks) {
  const count = Math.max(1, Math.trunc(stacks || 1));
  return Array.from({ length: count }, () => `(${formula})`).join(" + ");
}

async function rollFormula(formula) {
  const clean = String(formula ?? "").trim();
  if (!clean) throw new Error("Fórmula de dano não configurada.");
  const roll = await Roll.create(clean).evaluate();
  return { roll, total: Math.max(0, Math.trunc(Number(roll.total) || 0)) };
}

async function makeSave(actor, effect, label) {
  if (!effect?.saveAttr || effect.saveDc <= 0) return false;
  const value = parseNumber(actor.system?.props?.[`${effect.saveAttr.toLowerCase()}_display`]);
  const roll = await Roll.create(`1d20 + ${value}`).evaluate();
  const success = roll.total >= effect.saveDc;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${label}</strong> — ${effect.saveAttr} CD ${effect.saveDc}: ${success ? "Sucesso" : "Falha"}`,
  });
  return success;
}

function decrementEffect(state, key) {
  const effect = state.effects[key];
  if (!effect || effect.remainingTurns === null) return false;
  effect.remainingTurns = Math.max(0, effect.remainingTurns - 1);
  if (effect.remainingTurns > 0) return false;
  state.active = state.active.filter((entry) => entry !== key);
  delete state.effects[key];
  return true;
}

export async function processActorStatusTiming(actor, timing = "start") {
  if (!actor?.update) return { processed: false, reason: "actor-invalid" };
  const props = actor.system?.props ?? {};
  const state = parseStatusState(props.status_slayer_dados);
  state.exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  const active = new Set(state.active);
  const messages = [];

  if (timing === "start") {
    if (active.has("distraido")) {
      state.active = state.active.filter((key) => key !== "distraido");
      delete state.effects.distraido;
      messages.push("Distraído removido no início do turno");
    }
    if (active.has("confuso") && !active.has("encorajado")) {
      const confusion = await Roll.create("1d4").evaluate();
      const outcomes = ["", "ataca o aliado mais próximo", "ataca o inimigo mais próximo", "ataca a si mesmo", "perde a Ação de Ataque"];
      messages.push(`Confuso: ${outcomes[confusion.total]}`);
      await confusion.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Confuso — ${actor.name}</strong>` });
    }
  }

  const damageKeys = new Set(STATUS_SLAYER_DANO_CONTINUO);
  for (const key of [...state.active]) {
    const effect = state.effects[key];
    const defaultTiming = [
      "invisivel_inalvejavel", "vulneravel", "restricao_movimentos", "atordoamento", "paralisia",
      "colapso", "confuso", "amedrontado", "desorientado", "hipotermia", "suprimido",
    ].includes(key) ? "end" : "start";
    if ((effect?.tick ?? defaultTiming) !== timing) continue;

    if (damageKeys.has(key)) {
      const formula = key === "em_chamas" ? "1d4" : effect?.damageFormula;
      try {
        const { roll, total } = await rollFormula(key === "corroido" ? repeatedFormula(formula, effect?.stacks) : formula);
        if (total > 0) await applySlayerDamage(actor, total, { isAttack: false, source: key });
        if (total > 0) {
          for (const removedKey of ["confuso", "distraido", "sonhando"]) {
            state.active = state.active.filter((entry) => entry !== removedKey);
            delete state.effects[removedKey];
          }
        }
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${key.replaceAll("_", " ")}</strong> — dano no início do turno` });
        messages.push(`${key}: ${total} de dano`);
      } catch (error) {
        ui.notifications?.error?.(`${actor.name}: ${key} não processado — ${error.message}`);
      }
    }

    if ((key === "silenciado" || key === "suprimido" || key === "hipotermia") && await makeSave(actor, effect, key)) {
      state.active = state.active.filter((entry) => entry !== key);
      delete state.effects[key];
      messages.push(`${key} removido por salvaguarda`);
      continue;
    }
    if (decrementEffect(state, key)) messages.push(`${key} expirou`);
  }

  await actor.update(statePatch(state), { naCsbAutomation: true, naStatusTurn: true });
  if (messages.length) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<strong>Status — ${actor.name}</strong><br>${messages.join("<br>")}` });
  }
  return { processed: true, messages, state };
}

export async function reconcileSlayerExhaustion(actor) {
  if (!actor?.update || resolvingExhaustion.has(actor.id)) return null;
  const props = actor.system?.props ?? {};
  const state = parseStatusState(props.status_slayer_dados);
  state.exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  state.exhaustionMilestones = state.exhaustionMilestones.filter((level) => state.exhaustion >= level);
  const reached = [];
  let extraDamage = 0;
  const pdv = currentPdv(props);
  if (state.exhaustion >= 5 && !state.exhaustionMilestones.includes(5)) {
    extraDamage += Math.floor(pdv / 2);
    state.exhaustionMilestones.push(5);
    reached.push(5);
  }
  if (state.exhaustion >= 8 && !state.exhaustionMilestones.includes(8)) {
    extraDamage += Math.max(0, pdv - extraDamage);
    state.exhaustionMilestones.push(8);
    reached.push(8);
  }
  if (!reached.length) return { reached, extraDamage: 0 };
  resolvingExhaustion.add(actor.id);
  try {
    await actor.update({
      ...statePatch(state),
      "system.props.pdv_slayer_dano_tomado": parseNumber(props.pdv_slayer_dano_tomado) + extraDamage,
    }, { naCsbAutomation: true, naExhaustion: true });
    if (reached.includes(8)) {
      const updates = [...(game.combats ?? [])].flatMap((combat) => [...combat.combatants]
        .filter((combatant) => combatant.actorId === actor.id && !combatant.defeated)
        .map((combatant) => ({ combatant, update: combatant.update({ defeated: true }) }))) ?? [];
      await Promise.allSettled(updates.map(({ update }) => update));
    }
    await ChatMessage.create({ content: `<strong>Exaustão — ${actor.name}</strong><br>${reached.includes(8) ? "Nível 8: morte." : `Nível 5: perde ${extraDamage} PDV (metade do atual).`}` });
    return { reached, extraDamage };
  } finally {
    resolvingExhaustion.delete(actor.id);
  }
}

async function processCurrentTurn(combat) {
  if (!isPrimaryGm() || !combat?.started) return;
  const combatant = combat.combatant;
  const actor = combatant?.actor;
  if (!actor?.system?.props?.status_slayer_dados) return;
  const key = `${combat.id}:${combat.round}:${combat.turn}:${combatant.id}`;
  const previousKey = combat.getFlag(MODULE_ID, TURN_FLAG);
  if (previousKey === key) return;
  const previousCombatantId = String(previousKey ?? "").split(":").at(-1);
  const previousActor = previousCombatantId ? combat.combatants.get(previousCombatantId)?.actor : null;
  if (previousActor?.system?.props?.status_slayer_dados) await processActorStatusTiming(previousActor, "end");
  await combat.setFlag(MODULE_ID, TURN_FLAG, key);
  await processActorStatusTiming(actor, "start");
}

export function movementBlocked(props = {}) {
  const state = parseStatusState(props.status_slayer_dados);
  const exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  return exhaustion >= 3 || state.active.includes("restricao_movimentos") || state.active.includes("colapso");
}

export function resolveSlayerHealing(props = {}, requestedTotal = 0) {
  const state = parseStatusState(props.status_slayer_dados);
  const active = new Set(state.active);
  const exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  const current = parseNumber(props.pdv_slayer_curado);
  const delta = Math.max(0, parseNumber(requestedTotal) - current);
  const multiplier = exhaustion >= 8 ? 0 : active.has("corrupcao") || active.has("regeneracao_suprimida") ? 0.5 : 1;
  return { value: current + Math.floor(delta * multiplier), multiplier, requestedDelta: delta };
}

export function registerStatusEngine() {
  Hooks.on("combatStart", (combat) => void processCurrentTurn(combat));
  Hooks.on("updateCombat", (combat, changes) => {
    if (Object.hasOwn(changes, "turn") || Object.hasOwn(changes, "round")) void processCurrentTurn(combat);
  });
  Hooks.on("updateActor", (actor, changes, options) => {
    if (!isPrimaryGm() || options?.naExhaustion) return;
    const props = changes?.system?.props ?? {};
    if (Object.hasOwn(props, "status_slayer_exaustao") || Object.hasOwn(props, "status_slayer_dados")) {
      void reconcileSlayerExhaustion(actor);
    }
  });
  Hooks.on("preUpdateToken", (token, changes, options, userId) => {
    if (options?.naCsbAutomation || (!Object.hasOwn(changes, "x") && !Object.hasOwn(changes, "y"))) return;
    if (!movementBlocked(token.actor?.system?.props)) return;
    if (userId === game.user.id) ui.notifications.warn("Este personagem não pode usar movimento enquanto estiver enraizado ou restrito.");
    return false;
  });
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (options?.naCsbAutomation) return;
    const props = actor.system?.props ?? {};
    const nested = changes?.system?.props;
    const flatKey = "system.props.pdv_slayer_curado";
    const requested = nested?.pdv_slayer_curado ?? changes?.[flatKey];
    if (requested === undefined) return;
    const resolution = resolveSlayerHealing(props, requested);
    if (resolution.requestedDelta <= 0) return;
    if (nested && Object.hasOwn(nested, "pdv_slayer_curado")) nested.pdv_slayer_curado = resolution.value;
    else changes[flatKey] = resolution.value;
    if (resolution.multiplier < 1) ui.notifications.info(resolution.multiplier === 0 ? "Exaustão 8 impede recuperação." : "A cura recebida foi reduzida pela metade.");
  });
}
