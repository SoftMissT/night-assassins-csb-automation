import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWeaponRankFormulas, isWeaponProficient, slayerWeaponRank, weaponAmmoPatch, weaponAmmoState, weaponAttackAttributes, weaponDamageTypeKeys, weaponPropertyKeys, weaponProfilesForActor, weaponProfilesFromProps } from "../scripts/weapon-service.mjs";

describe("weapon-service", () => {
  it("resolve o Rank atual pela progressão do Caçador", () => {
    assert.equal(slayerWeaponRank({ nvl_num: 1 }), "");
    assert.equal(slayerWeaponRank({ nvl_num: 2 }), "D");
    assert.equal(slayerWeaponRank({ nvl_num: 8 }), "A");
    assert.equal(slayerWeaponRank({ nvl_num: 11 }), "S");
    assert.equal(slayerWeaponRank({ nvl_num: 12 }), "SS");
  });

  it("deriva o Rank mecânico sempre do nível, ignorando o texto narrativo de rank_atual", () => {
    assert.equal(slayerWeaponRank({ rank_atual: "Rank B", nvl_num: 12 }), "SS");
    assert.equal(slayerWeaponRank({ rank_atual: "Hashira Novato", nvl_num: 11 }), "S");
    assert.equal(slayerWeaponRank({ rank_atual: "Mizunoto" }), "");
    assert.equal(slayerWeaponRank({ nvl_pj: "nvl_6" }), "B");
    assert.equal(slayerWeaponRank({ nvl_pj: "nvl_2" }), "D");
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

  it("resolve os atributos de acerto pelas propriedades canônicas", () => {
    assert.deepEqual(weaponPropertyKeys("** Acuidade / Morote"), ["acuidade", "morote"]);
    assert.deepEqual(weaponAttackAttributes({ arma_propriedades: "** Acuidade / Morote" }), ["FOR", "DEX"]);
    assert.deepEqual(weaponAttackAttributes({ arma_propriedades: "** Manejável" }), ["DEX"]);
    assert.deepEqual(weaponAttackAttributes({ arma_propriedades: "** Concussão" }), ["FOR"]);
  });

  it("exige proficiência explícita quando a ficha começa a declarar proficiências", () => {
    const weapon = { arma_nome: "Katana" };
    assert.equal(isWeaponProficient(weapon, { armas_proficientes: "Katana; Naginata" }), true);
    assert.equal(isWeaponProficient(weapon, { armas_proficientes: "Rapieira" }), false);
    assert.equal(isWeaponProficient(weapon, {}), true);
  });

  it("deriva o dano de Acuidade/Morote e remove atributos sem proficiência", () => {
    const itemProps = {
      arma_nome: "Katana",
      arma_propriedades: "Acuidade / Morote",
      arma_perfis_ataque: [{ nome: "Morote", dano_fixo: 7, atributos: [], tipos_dano: ["cortante"] }],
    };
    const [proficient] = weaponProfilesForActor(itemProps, { nvl_num: 1 });
    assert.deepEqual(proficient.atributos.map((rule) => [rule.key, rule.multiplicador, rule.escolha]), [["FOR", 1, true], ["DEX", 1, true]]);
    const [unproficient] = weaponProfilesForActor(itemProps, { nvl_num: 1, armas_proficientes: "Rapieira" });
    assert.deepEqual(unproficient.atributos, []);
  });

  it("distingue perfis Nitoryu e Morote na contagem de golpes", () => {
    const profiles = weaponProfilesForActor({
      arma_nome: "Katana",
      arma_propriedades: "Acuidade / Nitoryu & Morote",
      arma_perfis_ataque: [
        { nome: "Nitoryu", dano_fixo: 5, atributos: [], tipos_dano: ["cortante"] },
        { nome: "Morote", dano_fixo: 7, atributos: [], tipos_dano: ["cortante"] },
      ],
    }, { nvl_num: 1 });
    assert.equal(profiles[0].ataques, 2);
    assert.equal(profiles[1].ataques, 1);
  });

  it("reconstrói o Ataque Base de um Item legado sem array de perfis", () => {
    const [profile] = weaponProfilesFromProps({
      arma_nome: "Arco Longo",
      arma_dano_fixo: 3,
      arma_dano_atributo: ["DEX"],
      arma_tipos_dano: ["perfurante"],
      arma_regra_completa: "Dano: 3 + Metade da DEX (arredondado para baixo)",
    });
    assert.equal(profile.nome, "Ataque Base");
    assert.deepEqual(profile.atributos, [{ key: "DEX", multiplicador: 0.5, escolha: false }]);
    assert.deepEqual(weaponProfilesForActor({
      arma_nome: "Arco Longo",
      arma_dano_fixo: 3,
      arma_dano_atributo: ["DEX"],
      arma_tipos_dano: ["perfurante"],
      arma_regra_completa: "Dano: 3 + Metade da DEX (arredondado para baixo)",
    }, { nvl_num: 1 })[0].atributos, profile.atributos);
  });

  it("aceita perfis e fórmulas estruturados persistidos como JSON textual", () => {
    const [profile] = weaponProfilesForActor({
      arma_perfis_ataque: JSON.stringify([{ nome: "Corte", dano_fixo: 4, atributos: JSON.stringify([{ key: "FOR", multiplicador: 1 }]), tipos_dano: ["cortante"] }]),
      arma_formulas_por_rank: JSON.stringify({ D: ["4 + FOR + 1d6 / Cortante"] }),
    }, { nvl_num: 2 });
    assert.equal(profile.nome, "Corte");
    assert.equal(profile.dano_dados, "1d6");
    assert.deepEqual(profile.atributos, [{ key: "FOR", multiplicador: 1, escolha: false }]);
  });

  it("normaliza rótulos de dano para as chaves do relay", () => {
    assert.deepEqual(weaponDamageTypeKeys("Cortante ou Concussivo, à escolha no acerto"), ["cortante", "concussao"]);
  });

  it("aceita aliases JSON dos campos que o CSB serializa", () => {
    const [profile] = weaponProfilesForActor({
      arma_nome: "Rebellion",
      arma_perfis_ataque_json: JSON.stringify([{ nome: "Ataque Base", dano_fixo: 7, atributos: [{ key: "FOR", multiplicador: 1 }], tipos_dano: ["concussivo"] }]),
      arma_formulas_por_rank_json: JSON.stringify({ D: ["7 + FOR + 1d6 / Concussivo"] }),
    }, { nvl_num: 2, for_display: 5 });
    assert.equal(profile.nome, "Ataque Base");
    assert.deepEqual(profile.tipos_dano, ["concussao"]);
    assert.equal(profile.dano_dados, "1d6");
  });

  it("bloqueia um perfil que exige dois disparos sem munição suficiente", () => {
    const state = weaponAmmoState({ arma_municao_capacidade: 2, arma_municao_atual: 1 }, { ataques: 2 });
    assert.deepEqual(state, { capacity: 2, current: 1, shots: 2, required: true });
    assert.deepEqual(weaponAmmoPatch({ arma_municao_capacidade: 2 }, -1), { "system.props.arma_municao_atual": 0 });
  });
});
