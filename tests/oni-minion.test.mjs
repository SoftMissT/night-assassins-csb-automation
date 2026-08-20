import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MINION_TYPE_IDS,
  MINION_PACKAGE_IDS,
  MINION_TRAIT_IDS,
  MINION_ATTACK_IDS,
  MINION_WEAKNESSES,
  sceneScale,
  minionLevel,
  minionPdv,
  minionPdk,
  getMinionPackage,
  buildMinion,
  buildMinionProps,
  recommendedCount,
} from "../scripts/oni/minion-builder.mjs";

describe("oni-minion catalogo", () => {
  it("tem 3 tipos, 6 pacotes, 4 ataques, 14 tracos e 10 fraquezas", () => {
    assert.equal(MINION_TYPE_IDS.length, 3);
    assert.equal(MINION_PACKAGE_IDS.length, 6);
    assert.equal(MINION_ATTACK_IDS.length, 4);
    assert.equal(MINION_TRAIT_IDS.length, 14);
    assert.equal(MINION_WEAKNESSES.length, 10);
  });

  it("Bruto tem FOR 4 VIT 3 FDV 2 DEX 1 INT 0 SAB 1 CAR 0", () => {
    const pkg = getMinionPackage("bruto");
    assert.equal(pkg.attributes.for, 4);
    assert.equal(pkg.attributes.vit, 3);
    assert.equal(pkg.attributes.fdv, 2);
    assert.equal(pkg.attributes.dex, 1);
    assert.equal(pkg.attributes.int, 0);
    assert.equal(pkg.attributes.sab, 1);
    assert.equal(pkg.attributes.car, 0);
  });

  it("Rapido tem DEX 4 SAB 3 FDV 2 VIT 1 FOR 1 INT 0 CAR 0", () => {
    const pkg = getMinionPackage("rapido");
    assert.equal(pkg.attributes.dex, 4);
    assert.equal(pkg.attributes.sab, 3);
    assert.equal(pkg.attributes.fdv, 2);
    assert.equal(pkg.attributes.vit, 1);
    assert.equal(pkg.attributes.for, 1);
    assert.equal(pkg.attributes.int, 0);
    assert.equal(pkg.attributes.car, 0);
  });
});

describe("oni-minion escala e nivel", () => {
  it("escala = maior nivel + quantidade de slayers", () => {
    assert.equal(sceneScale(3, 3), 6);
    assert.equal(sceneScale(1, 1), 2);
    assert.equal(sceneScale(5, 4), 9);
  });

  it("Fraco com escala 6 tem nivel 1", () => {
    assert.equal(minionLevel("fraco", 3, 3), 1);
  });

  it("Comum com escala 6 tem nivel 2", () => {
    assert.equal(minionLevel("comum", 3, 3), 2);
  });

  it("Forte com escala 6 tem nivel 3", () => {
    assert.equal(minionLevel("forte", 3, 3), 3);
  });

  it("nivel nunca passa de 6", () => {
    assert.equal(minionLevel("forte", 20, 5), 6);
  });

  it("nivel nunca baixa de 1", () => {
    assert.equal(minionLevel("fraco", 1, 1), 1);
  });
});

describe("oni-minion recursos", () => {
  it("Fraco nivel 1 VIT 1 tem PDV 10", () => {
    assert.equal(minionPdv("fraco", 1, 1), 10);
  });

  it("Comum nivel 2 VIT 1 tem PDV 15", () => {
    assert.equal(minionPdv("comum", 2, 1), 15);
  });

  it("Forte nivel 3 VIT 4 tem PDV 23", () => {
    assert.equal(minionPdv("forte", 3, 4), 23);
  });

  it("Fraco FDV 2 tem PDK 4", () => {
    assert.equal(minionPdk("fraco", 2), 4);
  });

  it("Comum FDV 2 tem PDK 6", () => {
    assert.equal(minionPdk("comum", 2), 6);
  });

  it("Forte FDV 3 tem PDK 9", () => {
    assert.equal(minionPdk("forte", 3), 9);
  });
});

describe("oni-minion builder", () => {
  it("buildMinion cria minion Rápido/Fraco/Nível 1", () => {
    const minion = buildMinion({
      type: "fraco",
      package: "rapido",
      attack: "garras",
      trait: "regeneracao_fraca",
      highestSlayerLevel: 1,
      slayerCount: 1,
    });
    assert.equal(minion.level, 1);
    assert.equal(minion.type, "fraco");
    assert.equal(minion.package, "rapido");
    assert.equal(minion.attributes.vit, 1);
    assert.equal(minion.attributes.dex, 4);
    assert.equal(minion.attributes.for, 1);
    assert.equal(minion.attributes.car, 0);
    assert.equal(minion.attributes.fdv, 2);
    assert.equal(minion.attributes.int, 0);
    assert.equal(minion.attributes.sab, 3);
    assert.equal(minion.pdv, 10);
    assert.equal(minion.pdk, 4);
    assert.equal(minion.attack.name, "Garras");
    assert.equal(minion.trait.name, "Regeneração Fraca");
    assert.ok(minion.weakness.length > 0);
  });

  it("buildMinionProps gera props com namespace oni_minion_*", () => {
    const minion = buildMinion({ type: "fraco", package: "rapido", highestSlayerLevel: 1, slayerCount: 1 });
    const props = buildMinionProps(minion);
    assert.equal(props.oni_minion_nome, minion.name);
    assert.equal(props.oni_minion_tipo, "fraco");
    assert.equal(props.oni_minion_nivel, 1);
    assert.equal(props.oni_minion_pdv_base, 10);
    assert.equal(props.oni_minion_pdk_base, 4);
    assert.equal(props.oni_minion_vit_base, 1);
    assert.equal(props.oni_minion_dex_base, 4);
    assert.equal(props.oni_minion_dex_display_label, "4");
    assert.ok(props.oni_minion_fraqueza.length > 0);
  });

  it("buildMinion rejeita pacote invalido", () => {
    assert.throws(() => buildMinion({ package: "inexistente" }), /Pacote de Minion inválido/);
  });
});

describe("oni-minion quantidade recomendada", () => {
  it("1 jogador cena facil = 1 fraco", () => {
    assert.deepEqual(recommendedCount(1, "facil"), [1]);
  });

  it("3 jogadores cena perigosa = 2 fortes", () => {
    assert.deepEqual(recommendedCount(3, "perigosa"), [2]);
  });

  it("5 jogadores cena media = 4 comuns", () => {
    assert.deepEqual(recommendedCount(5, "media"), [4]);
  });
});
