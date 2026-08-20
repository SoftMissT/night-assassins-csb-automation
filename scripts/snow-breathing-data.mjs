/** Dados mecânicos curados da Respiração da Neve. */

export const SNOW_SYNERGIES = Object.freeze(["Água", "Vento", "Cristal"]);

export const SNOW_FORMS = Object.freeze([
  { id: "neve_01", order: 1, name: "Fluxo de Neve", jp: "Ichi no Kata: Yuki no Nagare", action: "especial", levels: [
    { cost: 1, damage: "2d4" }, { cost: 1, damage: "2d6" }, { cost: 2, damage: "2d8" }, { cost: 2, damage: "2d10" },
  ] },
  { id: "neve_02", order: 2, name: "Inverno Sombrio", jp: "Ni no Kata: Yutsuna Fuyu", action: "especial", cooldown: 3, levels: [
    { cost: 2, penalty: -1 }, { cost: 2, penalty: -2 }, { cost: 3, penalty: -4 },
    { cost: 3, penalty: -4, vulnerabilities: ["cortante", "perfurante"] },
  ] },
  { id: "neve_03", order: 3, name: "Nevasca", jp: "San no Kata: Burizado", action: "unica", levels: [
    { cost: 3 }, { cost: 3 }, { cost: 3 }, { cost: 3 },
  ] },
  { id: "neve_04", order: 4, name: "Coração de Gelo", jp: "Shi no Kata: Aisu Hato", action: "ataque", levels: [
    { cost: 3 }, { cost: 3 }, { cost: 3 }, { cost: 3 },
  ] },
  { id: "neve_05", order: 5, name: "Avalanche Negativa", jp: "Go no Kata: Fu no Nadare", action: "ataque", levels: [
    { cost: 2, hitBonus: 1, damage: "2d6" }, { cost: 2, hitBonus: 1, damage: "4d8" },
    { cost: 3, hitBonus: 2, damage: "6d10" }, { cost: 3, hitBonus: 2, damage: "8d10" },
  ] },
  { id: "neve_06", order: 6, name: "Abaixo de Zero", jp: "Roku no Kata: Zero Ika", action: "especial", levels: [
    { cost: 2, fdvHit: true },
    { cost: 3, fdvHit: true, fdvDamage: true },
    { cost: 3, fdvHit: true, fdvDamage: true, freezeRecovery: true },
    { cost: 3, fdvHit: true, fdvDamage: true, freezeRecovery: true, freezeBurst: "6d4" },
  ] },
  { id: "neve_07", order: 7, name: "A Canção de um Dia Frio", jp: "Shichi no Kata: Samui Hi no Uta", action: "reacao", levels: [
    { cost: 3, negateEffects: true, damageMultiplier: 1 },
    { cost: 5, negateEffects: true, damageMultiplier: 0.5 },
    { cost: 5, negateEffects: true, damageMultiplier: 0.5, protectAlly: true },
    { cost: 6, negateEffects: true, damageMultiplier: 0.5, protectAlly: true, freeze: 1 },
  ] },
]);

export function snowFormById(id) {
  return SNOW_FORMS.find((form) => form.id === id) ?? null;
}
