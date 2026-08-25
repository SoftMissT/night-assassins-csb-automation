import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { normalizeRankFormulas, RANK_DICE } from "../tools/build-weapon-sources.mjs";

describe("geração sistêmica de fórmulas por Rank", () => {
  it("gera uma fórmula por Rank para cada perfil de ataque", () => {
    const profiles = [
      { nome: "Nunchaku", formula_texto: "4 + FOR ou DEX / Concussão" },
      { nome: "Tridente", formula_texto: "4 + FOR ou DEX / Perfurante" },
      { nome: "Mangual — Concussão", formula_texto: "5 + FOR ou DEX / Concussão" },
      { nome: "Mangual — Cortante", formula_texto: "5 + FOR ou DEX / Cortante" },
    ];

    const formulas = normalizeRankFormulas({}, profiles);

    assert.equal(formulas.B.length, 4);
    assert.equal(formulas.B[0], "4 + FOR ou DEX + 1d10 / Concussão");
    assert.equal(formulas.B[3], "5 + FOR ou DEX + 1d10 / Cortante");
  });

  it("usa a tabela universal de dados evolutivos em todos os Ranks", () => {
    const profiles = [{ nome: "Lâmina", formula_texto: "4 + FOR ou DEX / Cortante" }];
    const formulas = normalizeRankFormulas({}, profiles);

    for (const [rank, dice] of Object.entries(RANK_DICE)) {
      assert.ok(formulas[rank][0].includes(`+ ${dice} `), `Rank ${rank} deve usar ${dice}`);
    }
  });

  it("não duplica dado quando a fórmula extraída já tem dados evolutivos", () => {
    const profiles = [{ nome: "Especial", formula_texto: "3 + FOR + 2d6 / Sagrado" }];
    const formulas = normalizeRankFormulas({}, profiles);

    assert.equal(formulas.A[0], "3 + FOR + 2d6 / Sagrado");
  });

  it("substitui o placeholder 'dado evolutivo' pelo dado real do Rank", () => {
    const profiles = [{ nome: "Nunchaku", formula_texto: "4 + FOR ou DEX + dado evolutivo / Concussão" }];
    const formulas = normalizeRankFormulas({}, profiles);

    assert.equal(formulas.B[0], "4 + FOR ou DEX + 1d10 / Concussão");
    assert.ok(!formulas.B[0].includes("dado evolutivo"));
  });

  it("mantém extração do Markdown quando ela cobre todos os perfis", () => {
    const profiles = [
      { nome: "A", formula_texto: "4 + DEX / Cortante" },
      { nome: "B", formula_texto: "4 + DEX / Perfurante" },
    ];
    const extracted = { B: ["4 + DEX + 1d10 / Cortante", "6 + DEX + 1d10 / Perfurante"] };
    const formulas = normalizeRankFormulas(extracted, profiles);

    assert.deepEqual(formulas.B, extracted.B);
  });

  it("armas normais construídas não recebem fórmulas por Rank", async () => {
    const directory = new URL("../build/compendium/armas-slayer/", import.meta.url);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
    let weaponsChecked = 0;

    for (const file of files) {
      const document = JSON.parse(await readFile(new URL(`../build/compendium/armas-slayer/${file}`, import.meta.url), "utf8"));
      if (document.type !== "equippableItem") continue;
      const props = document.system?.props ?? {};
      const profiles = Array.isArray(props.arma_perfis_ataque) ? props.arma_perfis_ataque : [];
      if (profiles.length === 0) continue;
      weaponsChecked += 1;

      const formulas = JSON.parse(props.arma_formulas_por_rank_json);
      assert.deepEqual(formulas, {});
    }

    assert.equal(weaponsChecked, 3);
  });
});
