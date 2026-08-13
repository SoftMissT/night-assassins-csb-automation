import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWeaponRankFormulas, slayerWeaponRank, weaponProfilesForActor } from "../scripts/weapon-service.mjs";

describe("weapon-service", () => {
  it("resolve o Rank atual pela progressão do Caçador", () => {
    assert.equal(slayerWeaponRank({ nvl_num: 1 }), "");
    assert.equal(slayerWeaponRank({ nvl_num: 2 }), "D");
    assert.equal(slayerWeaponRank({ nvl_num: 8 }), "A");
    assert.equal(slayerWeaponRank({ nvl_num: 11 }), "S");
    assert.equal(slayerWeaponRank({ nvl_num: 12 }), "SS");
  });

  it("prioriza um Rank explícito da ficha", () => {
    assert.equal(slayerWeaponRank({ rank_atual: "Rank B", nvl_num: 12 }), "B");
  });

  it("extrai as seis fórmulas evolutivas da regra da arma", () => {
    const markdown = `# DANO POR RANK\n## Rank D Nível 2\n\`4 + DEX + 1d6 / Cortante\`\n## Rank C Nível 4\n\`4 + DEX + 1d8 / Cortante\`\n## Rank B Nível 6\n\`4 + DEX + 1d10 / Cortante\`\n## Rank A Nível 8\n\`4 + DEX + 1d12 / Cortante\`\n## Rank S Nível 11\n\`4 + DEX + 2d6 / Cortante\`\n## Rank SS Nível 12\n\`4 + DEX + 2d8 / Cortante\`\n# OUTRA REGRA`;
    const formulas = extractWeaponRankFormulas(markdown);
    assert.deepEqual(Object.keys(formulas), ["D", "C", "B", "A", "S", "SS"]);
    assert.equal(formulas.B[0], "4 + DEX + 1d10 / Cortante");
  });

  it("acrescenta somente o dado do Rank ao perfil base", () => {
    const profiles = weaponProfilesForActor({
      arma_perfis_ataque: [{ nome: "Lâmina", dano_fixo: 4, dano_dados: "", atributos: [{ key: "DEX", multiplicador: 1 }], tipos_dano: ["cortante"] }],
      arma_formulas_por_rank: { B: ["4 + DEX + 1d10 / Cortante"] },
    }, { nvl_num: 6, dex_display: 5 });
    assert.equal(profiles[0].dano_dados, "1d10");
    assert.equal(profiles[0].dano_fixo, 4);
    assert.equal(profiles[0].rank, "B");
  });

  it("escolhe FOR ou DEX sem remover FDV da fórmula", () => {
    const [profile] = weaponProfilesForActor({
      arma_perfis_ataque: [{
        formula_texto: "5 + metade de FOR ou DEX + FDV / Perfurante",
        atributos: [
          { key: "FOR", multiplicador: 0.5 },
          { key: "DEX", multiplicador: 0.5 },
          { key: "FDV", multiplicador: 1 },
        ],
      }],
    }, { nvl_num: 1 });
    assert.equal(profile.atributos.find((rule) => rule.key === "FOR").escolha, true);
    assert.equal(profile.atributos.find((rule) => rule.key === "DEX").escolha, true);
    assert.equal(profile.atributos.find((rule) => rule.key === "FDV").escolha, false);
  });
});
