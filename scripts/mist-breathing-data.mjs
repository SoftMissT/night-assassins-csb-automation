/** Dados mecânicos curados da Respiração da Névoa. */

export const MIST_FORMS = Object.freeze([
  { id: "nevoa_01", order: 1, name: "Céu Suspenso", jp: "Ichi no Kata Suiten Togasumi", action: "especial", levels: [
    { cost: 1, bonus: "@sab" }, { cost: 1, bonus: "@sab + 1" }, { cost: 2, bonus: "@sab + 2" }, { cost: 2, bonus: "@sab + 3" },
  ] },
  { id: "nevoa_02", order: 2, name: "Névoa de Oito Camadas", jp: "Ni no Kata Yaekasumi", action: "ataque", levels: [
    { cost: 3, damage: "5d6" }, { cost: 3, damage: "6d6" }, { cost: 3, damage: "8d6" }, { cost: 3, damage: "10d6" },
  ] },
  { id: "nevoa_03", order: 3, name: "Expansão de Névoa", jp: "San no Kata Kasan no Shibuki", action: "reacao", levels: [
    { cost: 3, reduction: "1d6 + @level" }, { cost: 3, reduction: "1d6 + @level" }, { cost: 3, reduction: "1d6 + @level + @sab" }, { cost: 3, reduction: "1d6 + @level + @sab" },
  ] },
  { id: "nevoa_04", order: 4, name: "Corte de Advecção / Fecha Neblinada", jp: "Shi no Kata Iryukir", action: "especial", levels: [
    { cost: 2, damage: "3d6" }, { cost: 2, damage: "4d6" }, { cost: 3, damage: "5d6" }, { cost: 3, damage: "6d6" },
  ] },
  { id: "nevoa_05", order: 5, name: "Mar de Nuvens Neblinadas", jp: "Go no Kata Kaun no Umi", action: "reacao", levels: [
    null, { cost: 2, saveDc: "9 + @sab" }, { cost: 2, saveDc: "10 + @sab" }, { cost: 3, saveDc: "12 + @sab" },
  ] },
  { id: "nevoa_06", order: 6, name: "Névoa sob o Luar", jp: "Roku no Kata Tsuki no Kashō", action: "completa", levels: [
    { cost: 2 }, { cost: 2 }, { cost: 2 }, { cost: 2 },
  ] },
  { id: "nevoa_07", order: 7, name: "Neblina", jp: "Shichi no Kata Oboro", action: "especial", levels: [
    null, { cost: 4, bonus: 2 }, { cost: 5, bonus: 3 }, { cost: 6, bonus: 4 },
  ] },
  { id: "nevoa_08", order: 8, name: "Ofuscamento", jp: "Hachi no Kata Nandoku-ka", action: "unica", levels: [
    null, { cost: 7, hitPenalty: -2 }, { cost: 7, hitPenalty: -2, hitBonus: 2 }, { cost: 7, hitPenalty: -2, hitBonus: 2, criticalImmunity: true },
  ] },
]);

export function mistFormById(id) {
  return MIST_FORMS.find((form) => form.id === id) ?? null;
}
