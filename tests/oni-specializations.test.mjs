import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPECIALIZATION_IDS,
  getSpecialization,
  specializationRank,
  specializationAbilities,
  specializationAbilityAt,
  specializationRankGainedAt,
  specializationSummary,
} from "../scripts/oni/specialization-resolver.mjs";

describe("oni specializations catalogo", () => {
  it("tem 10 especializacoes", () => {
    assert.equal(SPECIALIZATION_IDS.length, 10);
    assert.ok(SPECIALIZATION_IDS.includes("titan"));
    assert.ok(SPECIALIZATION_IDS.includes("toxico"));
    assert.ok(SPECIALIZATION_IDS.includes("mestre_recuperacao"));
    assert.ok(SPECIALIZATION_IDS.includes("artista_marcial"));
    assert.ok(SPECIALIZATION_IDS.includes("espadachim_profano"));
    assert.ok(SPECIALIZATION_IDS.includes("nobre_de_sangue"));
    assert.ok(SPECIALIZATION_IDS.includes("tecelao_de_sangue"));
    assert.ok(SPECIALIZATION_IDS.includes("cacador_noturno"));
    assert.ok(SPECIALIZATION_IDS.includes("marionetista"));
    assert.ok(SPECIALIZATION_IDS.includes("soberano_demonico"));
  });

  it("Titan tem FOR/VIT/FDV como atributos principais", () => {
    const spec = getSpecialization("titan");
    assert.deepEqual(spec.primaryAttributes, ["for", "vit", "fdv"]);
  });

  it("Toxico tem VIT/DEX/CAR como atributos principais", () => {
    const spec = getSpecialization("toxico");
    assert.deepEqual(spec.primaryAttributes, ["vit", "dex", "car"]);
  });

  it("todas as especializacoes tem 20 niveis", () => {
    for (const id of SPECIALIZATION_IDS) {
      const spec = getSpecialization(id);
      assert.equal(Object.keys(spec.levels).length, 20, `${id} deveria ter 20 niveis`);
    }
  });

  it("getSpecialization retorna null para inexistente", () => {
    assert.equal(getSpecialization("inexistente"), null);
  });
});

describe("oni specializations rank", () => {
  it("nivel 1-4 = Rank D", () => {
    assert.equal(specializationRank(1), "D");
    assert.equal(specializationRank(4), "D");
  });

  it("nivel 5-8 = Rank C", () => {
    assert.equal(specializationRank(5), "C");
    assert.equal(specializationRank(8), "C");
  });

  it("nivel 9-12 = Rank B", () => {
    assert.equal(specializationRank(9), "B");
    assert.equal(specializationRank(12), "B");
  });

  it("nivel 13-16 = Rank A", () => {
    assert.equal(specializationRank(13), "A");
    assert.equal(specializationRank(16), "A");
  });

  it("nivel 17-19 = Rank S", () => {
    assert.equal(specializationRank(17), "S");
    assert.equal(specializationRank(19), "S");
  });

  it("nivel 20 = Rank SS", () => {
    assert.equal(specializationRank(20), "SS");
  });
});

describe("oni specializations abilities", () => {
  it("Titan nivel 1 tem Corpo Pesado", () => {
    const ability = specializationAbilityAt("titan", 1);
    assert.equal(ability.name, "Corpo Pesado");
    assert.equal(ability.rank, "D");
  });

  it("Titan nivel 20 tem Titã Absoluto", () => {
    const ability = specializationAbilityAt("titan", 20);
    assert.equal(ability.name, "Titã Absoluto");
    assert.equal(ability.rank, "SS");
  });

  it("Titan nivel 5 tem Carregar (Rank C)", () => {
    const ability = specializationAbilityAt("titan", 5);
    assert.equal(ability.name, "Carregar");
    assert.equal(ability.rank, "C");
  });

  it("specializationAbilities lista todas as habilidades ate o nivel", () => {
    const abilities = specializationAbilities("titan", 5);
    assert.equal(abilities.length, 5);
    assert.equal(abilities[0].name, "Corpo Pesado");
    assert.equal(abilities[4].name, "Carregar");
  });

  it("Toxico nivel 3 tem Decomposicao", () => {
    const ability = specializationAbilityAt("toxico", 3);
    assert.equal(ability.name, "Decomposição");
  });

  it("Mestre Recuperacao nivel 20 tem Imortalidade Imperfeita", () => {
    const ability = specializationAbilityAt("mestre_recuperacao", 20);
    assert.equal(ability.name, "Imortalidade Imperfeita");
  });

  it("Espadachim Profano nivel 1 tem Arma Vinculada", () => {
    const ability = specializationAbilityAt("espadachim_profano", 1);
    assert.equal(ability.name, "Arma Vinculada");
    assert.deepEqual(getSpecialization("espadachim_profano").primaryAttributes, ["dex", "for", "int", "fdv"]);
  });

  it("Espadachim Profano nivel 20 tem Espada Demoníaca Suprema", () => {
    const ability = specializationAbilityAt("espadachim_profano", 20);
    assert.equal(ability.name, "Espada Demoníaca Suprema");
    assert.equal(ability.rank, "SS");
  });

  it("Nobre de Sangue nivel 10 tem Servo Menor", () => {
    const ability = specializationAbilityAt("nobre_de_sangue", 10);
    assert.equal(ability.name, "Servo Menor");
  });

  it("Nobre de Sangue nivel 20 tem Progenitor Demoníaco", () => {
    const ability = specializationAbilityAt("nobre_de_sangue", 20);
    assert.equal(ability.name, "Progenitor Demoníaco");
  });

  it("Tecelao de Sangue nivel 13 tem Dupla Forma", () => {
    const ability = specializationAbilityAt("tecelao_de_sangue", 13);
    assert.equal(ability.name, "Dupla Forma");
  });

  it("Tecelao de Sangue nivel 20 tem Arte de Sangue Perfeita", () => {
    const ability = specializationAbilityAt("tecelao_de_sangue", 20);
    assert.equal(ability.name, "Arte de Sangue Perfeita");
  });

  it("Cacador Noturno nivel 9 tem Presa Marcada", () => {
    const ability = specializationAbilityAt("cacador_noturno", 9);
    assert.equal(ability.name, "Presa Marcada");
  });

  it("Cacador Noturno nivel 20 tem Predador Absoluto", () => {
    const ability = specializationAbilityAt("cacador_noturno", 20);
    assert.equal(ability.name, "Predador Absoluto");
  });

  it("Marionetista nivel 3 tem Fios de Controle", () => {
    const ability = specializationAbilityAt("marionetista", 3);
    assert.equal(ability.name, "Fios de Controle");
  });

  it("Marionetista nivel 20 tem Palco da Marionete Suprema", () => {
    const ability = specializationAbilityAt("marionetista", 20);
    assert.equal(ability.name, "Palco da Marionete Suprema");
  });

  it("Soberano Demoníaco nivel 13 tem Domínio do Monarca Menor", () => {
    const ability = specializationAbilityAt("soberano_demonico", 13);
    assert.equal(ability.name, "Domínio do Monarca Menor");
  });

  it("Soberano Demoníaco nivel 20 tem Soberania Absoluta", () => {
    const ability = specializationAbilityAt("soberano_demonico", 20);
    assert.equal(ability.name, "Soberania Absoluta");
  });

  it("specializationRankGainedAt retorna faixa do rank", () => {
    const band = specializationRankGainedAt("titan", "B");
    assert.equal(band.minLevel, 9);
    assert.equal(band.maxLevel, 12);
  });
});

describe("oni specializations summary", () => {
  it("summary do Titan nivel 10", () => {
    const summary = specializationSummary("titan", 10);
    assert.equal(summary.name, "Titan");
    assert.equal(summary.rank, "B");
    assert.equal(summary.level, 10);
    assert.equal(summary.abilityCount, 10);
    assert.equal(summary.currentAbility.name, "Agarrão Monstruoso");
  });

  it("summary de especializacao inexistente retorna null", () => {
    assert.equal(specializationSummary("inexistente", 5), null);
  });
});
