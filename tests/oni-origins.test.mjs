import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getOniOrigin,
  isFallenSlayerOrigin,
  originAttributeBonus,
  originInitialPdv,
  originInitialPdk,
  fallenSlayerPdv,
  fallenSlayerPdk,
  ONI_ORIGIN_IDS,
} from "../scripts/oni/origin-resolver.mjs";
import {
  SEVEN_ATTRIBUTES,
  totalAttributeChoices,
  fixedAttributeBonus,
  demonicBodyAvailable,
  resolveOniAttributes,
  resolveOniDisplay,
  parsePersistedChoices,
} from "../scripts/oni/attribute-resolver.mjs";

describe("oni-origins catalogo", () => {
  it("tem 21 origens", () => {
    assert.equal(ONI_ORIGIN_IDS.length, 21);
  });

  it("Oni Comum tem PDV 18+VIT e PDK 8+(FDV×3)", () => {
    assert.equal(originInitialPdv("oni_comum", 4), 22);
    assert.equal(originInitialPdk("oni_comum", 2), 8 + 2 * 3);
  });

  it("Passado Triste tem PDV 22+VIT e PDK legacy 2+FDV+(FDV×3)", () => {
    assert.equal(originInitialPdv("passado_triste", 4), 26);
    assert.equal(originInitialPdk("passado_triste", 2), 2 + 2 + 2 * 3);
  });

  it("Chama Negra tem PDV 32+VIT e PDK 20+(FDV×3)", () => {
    assert.equal(originInitialPdv("chama_negra", 5), 37);
    assert.equal(originInitialPdk("chama_negra", 3), 20 + 3 * 3);
  });

  it("Eco Eterno tem bonus +1 SAB +2 FDV", () => {
    const bonus = originAttributeBonus("eco_eterno");
    assert.equal(bonus.sab, 1);
    assert.equal(bonus.fdv, 2);
    assert.equal(bonus.vit, undefined);
  });

  it("Raiz Podre tem bonus +2 VIT", () => {
    const bonus = originAttributeBonus("raiz_podre");
    assert.equal(bonus.vit, 2);
  });

  it("Exterminador Corrompido e caso especial fallen_slayer", () => {
    assert.equal(isFallenSlayerOrigin("exterior_corrompido"), true);
    assert.equal(originInitialPdv("exterior_corrompido", 5), null);
    assert.equal(originInitialPdk("exterior_corrompido", 5), null);
    assert.equal(fallenSlayerPdv(5, 3), 30 + 5 * 3 + 10 * 3);
    assert.equal(fallenSlayerPdk(12, 3, 4), 12 + 3 * 2 + 4 * 3);
  });

  it("Espirito Ceifador tem PDV 20+VIT e PDK 18+(FDV×3)", () => {
    assert.equal(originInitialPdv("espirito_ceifador", 4), 24);
    assert.equal(originInitialPdk("espirito_ceifador", 2), 18 + 2 * 3);
  });

  it("Vampiro de Linhagem tem PDV 19+VIT e PDK 20+(FDV×3)", () => {
    assert.equal(originInitialPdv("vampiro_de_linhagem", 4), 23);
    assert.equal(originInitialPdk("vampiro_de_linhagem", 2), 20 + 2 * 3);
  });

  it("Monarca Demoníaco tem PDV 22+VIT e PDK 20+(FDV×3)", () => {
    assert.equal(originInitialPdv("monarca_demoniaco", 4), 26);
    assert.equal(originInitialPdk("monarca_demoniaco", 2), 20 + 2 * 3);
  });

  it("Demonio de Linhagem Infernal tem PDV 21+VIT e PDK 20+(FDV×3)", () => {
    assert.equal(originInitialPdv("demonio_de_linhagem_infernal", 4), 25);
    assert.equal(originInitialPdk("demonio_de_linhagem_infernal", 2), 20 + 2 * 3);
  });

  it("origem inexistente retorna null/0", () => {
    assert.equal(getOniOrigin("inexistente"), null);
    assert.equal(originInitialPdv("inexistente", 5), 0);
    assert.equal(originInitialPdk("inexistente", 5), 0);
    assert.deepEqual(originAttributeBonus("inexistente"), {});
  });
});

describe("oni attribute-resolver", () => {
  it("sete atributos canonicos", () => {
    assert.deepEqual(SEVEN_ATTRIBUTES, ["vit", "dex", "for", "car", "fdv", "int", "sab"]);
  });

  it("total de escolhas de atributo por nivel", () => {
    assert.equal(totalAttributeChoices(1), 0);
    assert.equal(totalAttributeChoices(3), 1);
    assert.equal(totalAttributeChoices(4), 2);
    assert.equal(totalAttributeChoices(6), 3);
    assert.equal(totalAttributeChoices(8), 4);
    assert.equal(totalAttributeChoices(11), 5);
    assert.equal(totalAttributeChoices(12), 7);
    assert.equal(totalAttributeChoices(20), 7);
  });

  it("bonus fixo de nivel 16: +2 FDV", () => {
    assert.deepEqual(fixedAttributeBonus(15), {});
    assert.deepEqual(fixedAttributeBonus(16), { fdv: 2 });
    assert.deepEqual(fixedAttributeBonus(20), { fdv: 2 });
  });

  it("aumento de corpo demoniaco disponivel no nivel 13+", () => {
    assert.equal(demonicBodyAvailable(12), false);
    assert.equal(demonicBodyAvailable(13), true);
    assert.equal(demonicBodyAvailable(20), true);
  });

  it("resolve atributos base + bonus de origem", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "raiz_podre",
      level: 1,
    });
    assert.equal(resolved.vit, 7);
    assert.equal(resolved.dex, 3);
    assert.equal(resolved.for, 4);
    assert.equal(resolved.car, 1);
    assert.equal(resolved.fdv, 3);
    assert.equal(resolved.int, 2);
    assert.equal(resolved.sab, 2);
  });

  it("resolve atributos com bonus fixo de nivel 16", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 16,
    });
    assert.equal(resolved.fdv, 3 + 2);
    assert.equal(resolved.vit, 6);
  });

  it("resolve atributos com aumento de corpo demoniaco +2 FOR", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 13,
      demonicBodyChoice: { attr: "for", amount: 2 },
    });
    assert.equal(resolved.for, 4 + 2);
    assert.equal(resolved.vit, 6);
  });

  it("aumento de corpo demoniaco so aceita VIT/FOR/DEX", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 13,
      demonicBodyChoice: { attr: "car", amount: 2 },
    });
    assert.equal(resolved.car, 1);
  });

  it("resolve com bonus temporarios sem depender de Slayer", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 5,
      temporaryBonuses: { vit: 2, for: 1 },
    });
    assert.equal(resolved.vit, 5 + 1 + 2);
    assert.equal(resolved.for, 4 + 1);
  });

  it("resolveOniDisplay gera vit_display ate sab_display", () => {
    const display = resolveOniDisplay({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 1,
    });
    assert.equal(display.vit_display, 6);
    assert.equal(display.dex_display, 3);
    assert.equal(display.for_display, 4);
    assert.equal(display.car_display, 1);
    assert.equal(display.fdv_display, 3);
    assert.equal(display.int_display, 2);
    assert.equal(display.sab_display, 2);
  });

  it("parsePersistedChoices le escolhas persistidas", () => {
    const choices = parsePersistedChoices({
      oni_atr_escolha_nvl3: "vit",
      oni_atr_escolha_nvl4: "for",
      oni_atr_escolha_nvl6: "vit",
      oni_atr_escolha_nvl8: "dex",
      oni_atr_escolha_nvl11: "fdv",
      oni_atr_escolha_nvl12: "int+sab",
    });
    assert.equal(choices.vit, 2);
    assert.equal(choices.for, 1);
    assert.equal(choices.dex, 1);
    assert.equal(choices.fdv, 1);
    assert.equal(choices.int, 1);
    assert.equal(choices.sab, 1);
  });

  it("Actor Oni com chaves Slayer herdadas continua resolvendo atributos Oni", () => {
    const resolved = resolveOniAttributes({
      baseAttributes: { vit: 5, dex: 3, for: 4, car: 1, fdv: 3, int: 2, sab: 2 },
      originId: "oni_comum",
      level: 5,
      temporaryBonuses: { metal_slayer_pdr_bonus: 999, marca_temp_for: 999 },
    });
    assert.equal(resolved.for, 4);
    assert.equal(resolved.vit, 6);
    assert.equal(resolved.fdv, 3);
  });
});
