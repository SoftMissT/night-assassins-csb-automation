const LEVEL = (cost, options = {}) => Object.freeze({ cost, ...options });

export const STONE_FORMS = Object.freeze([
  { id: "pedra_01", style: 1, name: "Serpentino Duplo", action: "unica", levels: [
    LEVEL(1, { damage: "1d4", damageTypes: ["ferida"], damageComponents: [{ formula: "1d4", types: ["ferida"] }] }),
    LEVEL(2, { damage: "1d6", damageTypes: ["ferida"], damageComponents: [{ formula: "1d6", types: ["ferida"] }] }),
    LEVEL(2, { damage: "2d4", damageTypes: ["ferida"], damageComponents: [{ formula: "2d4", types: ["ferida"] }] }),
    LEVEL(3, { damage: "2d4 + @for", damageTypes: ["ferida", "concussao"], damageComponents: [{ formula: "2d4", types: ["ferida"] }, { formula: "@for", types: ["concussao"] }] }),
  ] },
  { id: "pedra_02", style: 2, name: "Quebra Superior / Esmagamento da Superfície / Pedregulho Gigante", action: "ataque", levels: [
    LEVEL(3, { damage: "3d10", damageTypes: ["concussao"], bleeding: 4, bleedingTurns: 2 }),
    LEVEL(3, { damage: "3d10", damageTypes: ["concussao"], bleeding: 5, bleedingTurns: 2 }),
    LEVEL(4, { damage: "4d10", damageTypes: ["concussao"], bleeding: 6, bleedingTurns: 2 }),
    LEVEL(4, { damage: "5d10", damageTypes: ["concussao"], bleeding: 7, bleedingTurns: 2 }),
  ] },
  { id: "pedra_03", style: 3, name: "Reflexão Ígnea / Flechas de Pedra", action: "reacao", levels: [
    LEVEL(3, { attackPenaltyBase: 1 }), LEVEL(3, { attackPenaltyBase: 2 }),
    LEVEL(3, { attackPenaltyBase: 2, blockBonus: 1, blockTurns: 2 }),
    LEVEL(4, { attackPenaltyBase: 2, blockBonus: 1, blockTurns: 2, counterAttack: true }),
  ] },
  { id: "pedra_04", style: 4, name: "Riólito, Subjugação Rápida / Ravina", actions: ["ataque", "especial"], levels: [
    null, null,
    LEVEL(6, { damage: "6d6", damageTypes: ["concussao"], attacks: 2, recoverPdrOnCritical: 2 }),
    LEVEL(6, { damage: "8d6", damageTypes: ["concussao"], attacks: 2, recoverPdrOnCritical: 2 }),
  ] },
  { id: "pedra_05", style: 5, name: "Resiliência", action: "ataque", oncePerCombat: true, levels: [
    LEVEL(5, { turns: 3, resistances: ["concussao", "cortante", "perfurante"] }),
    LEVEL(5, { turns: 3, resistances: ["concussao", "cortante", "perfurante"] }),
    LEVEL(5, { turns: 3, resistances: ["concussao", "cortante", "perfurante"] }),
    LEVEL(5, { turns: 3, resistances: ["concussao", "cortante", "perfurante"] }),
  ] },
]);

export function stoneFormById(id) {
  return STONE_FORMS.find((form) => form.id === String(id ?? "")) ?? null;
}
