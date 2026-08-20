import { classRankAtLevel, masterBattleLevelElevenPlan } from "./class-contracts.mjs";

const RANK_ORDER = ["C", "B", "A", "S", "SS"];
const RANK_LEVELS = Object.freeze({ C: 4, B: 6, A: 8, S: 11, SS: 12 });

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function resolveClassRank(classKey, level) {
  if (!classKey) return null;
  return classRankAtLevel(level);
}

export function classStateKey(classKey, suffix) {
  const short = String(classKey ?? "").replace(/^classe_/, "");
  return suffix ? `slayer_class_${short}_${suffix}` : `slayer_class_${short}`;
}

export function mbDamageBonus(rank) {
  if (rank === "B") return 4;
  if (rank === "C") return 2;
  return 0;
}

export function mbShouldApplyPermanentPdv(props = {}) {
  const plan = masterBattleLevelElevenPlan(props);
  return plan.eligible && plan.permanentPdv !== null;
}

export function mbPermanentPdvPatch(rolledTotal, alreadyApplied = 0) {
  const gain = Math.max(0, integer(rolledTotal));
  const applied = Math.max(0, integer(alreadyApplied));
  return Object.freeze({
    "system.props.pdv_slayer_extra": integer(applied + gain),
    [`system.props.${classStateKey("classe_mb", "corpo_guerra_applied")}`]: integer(applied + gain),
  });
}

export function mbParryAvailable(props = {}) {
  const used = props[classStateKey("classe_mb", "parry_used_round")];
  return integer(used) === 0;
}

export function mbParryConsume() {
  return Object.freeze({ [`system.props.${classStateKey("classe_mb", "parry_used_round")}`]: 1 });
}

export function mbParryReduction(rank, defenseAttribute) {
  if (rank !== "S" && rank !== "SS") return 0;
  return Math.max(0, integer(defenseAttribute));
}

export function poisonApply(targetProps = {}, attackerCarisma = 0, rank = "C") {
  const car = Math.max(0, integer(attackerCarisma));
  const damage = rank === "B" || rank === "A" ? car + 2 : car;
  const rounds = rank === "B" || rank === "A" || rank === "S" || rank === "SS" ? 3 : 2;
  const maxStacks = rank === "S" || rank === "SS" ? 3 : 1;
  return Object.freeze({
    "system.props.slayer_veneno_dano": damage,
    "system.props.slayer_veneno_rodadas": rounds,
    "system.props.slayer_veneno_stacks": Math.min(maxStacks, integer(targetProps.slayer_veneno_stacks) + 1),
    "system.props.slayer_veneno_fonte": "classe_usuario_de_veneno",
  });
}

export function poisonTick(props = {}) {
  const stacks = Math.max(0, integer(props.slayer_veneno_stacks));
  if (stacks === 0) return { damage: 0, patch: {} };
  const perStack = Math.max(0, integer(props.slayer_veneno_dano));
  const totalDamage = perStack * stacks;
  const remaining = Math.max(0, integer(props.slayer_veneno_rodadas) - 1);
  if (remaining <= 0) {
    return {
      damage: totalDamage,
      patch: Object.freeze({
        "system.props.slayer_veneno_rodadas": 0,
        "system.props.slayer_veneno_stacks": 0,
        "system.props.slayer_veneno_dano": 0,
      }),
    };
  }
  return {
    damage: totalDamage,
    patch: Object.freeze({ "system.props.slayer_veneno_rodadas": remaining }),
  };
}

export function cortaCuraMultiplier(props = {}) {
  const stacks = Math.max(0, integer(props.slayer_veneno_stacks));
  if (stacks === 0) return 1;
  return 0.5;
}

export function kakushiAmpararHeal(rank, intOrSab = 0) {
  const attr = Math.max(0, integer(intOrSab));
  if (rank === "C") return attr;
  if (rank === "B" || rank === "A" || rank === "S" || rank === "SS") return 3 + attr;
  return 0;
}

export function kakushiAmpararAvailable(props = {}) {
  const used = props[classStateKey("classe_kakushi", "amparar_used_round")];
  return integer(used) === 0;
}

export function kakushiAmpararConsume() {
  return Object.freeze({ [`system.props.${classStateKey("classe_kakushi", "amparar_used_round")}`]: 1 });
}

export function kakushiTatakaaeeeRoll(carisma = 0) {
  const car = Math.max(0, integer(carisma));
  const threshold = 15;
  const bonus = car * 2;
  return Object.freeze({ threshold, bonus, car });
}

export function resetClassTurnState(classKey, props = {}) {
  const patches = {};
  const base = classStateKey(classKey, "");
  for (const key of Object.keys(props)) {
    if (key.startsWith(base) && key.endsWith("_turn")) {
      patches[`system.props.${key}`] = 0;
    }
  }
  return Object.freeze(patches);
}

export function resetClassRoundState(classKey, props = {}) {
  const patches = {};
  const base = classStateKey(classKey, "");
  for (const key of Object.keys(props)) {
    if (key.startsWith(base) && key.endsWith("_round")) {
      patches[`system.props.${key}`] = 0;
    }
  }
  return Object.freeze(patches);
}

export function classEventContext({ classKey, level, event, props = {} }) {
  const rank = resolveClassRank(classKey, level);
  if (!rank) return { rank: null, applicable: false };
  const events = {
    "basic-hit": ["C", "B"],
    "basic-critical": ["A"],
    "physical-melee-damage": ["S"],
    "enemy-misses-melee": ["SS"],
    "turn-start": ["C", "B", "A", "S", "SS"],
    "round-start": ["C", "B", "A", "S", "SS"],
  };
  const applicableRanks = events[event] ?? [];
  return Object.freeze({
    rank,
    applicable: applicableRanks.includes(rank),
    event,
  });
}
