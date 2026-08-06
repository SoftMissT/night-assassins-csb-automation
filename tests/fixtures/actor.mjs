/**
 * @fileoverview Fixture de Actor mockada para testes unitários.
 */

export function makeActor(overrides = {}) {
  const props = {
    nvl_pj: 1,
    hab_escolhida: "hab_escolhida_base",
    hab_marca_destino_atributo: "",
    hab_marca_destino_bonus: 0,
    na_automacao_versao_dados: 1,
    atr_vit_valor: "<span>4</span>",
    atr_dex_valor: "<span>3</span>",
    atr_for_valor: "<span>2</span>",
    atr_car_valor: "<span>2</span>",
    atr_fdv_valor: "<span>1</span>",
    atr_int_valor: "<span>1</span>",
    atr_sab_valor: "<span>1</span>",
    atr_vit_valor_config: 4,
    atr_dex_valor_config: 3,
    atr_for_valor_config: 2,
    atr_car_valor_config: 2,
    atr_fdv_valor_config: 1,
    atr_int_valor_config: 1,
    atr_sab_valor_config: 1,
    vit_nvl1: 4,
    dex_nvl1: 3,
    for_nvl1: 2,
    car_nvl1: 2,
    fdv_nvl1: 1,
    int_nvl1: 1,
    sab_nvl1: 1,
    acerto_label: "acerto_label_dex",
    pdr_gasto_valor: 0,
    pdv_oni_dano_tomado: 0,
    ...overrides.props,
  };

  const actor = {
    id: overrides.id ?? "actor_001",
    uuid: overrides.uuid ?? "Actor.actor_001",
    name: overrides.name ?? "Personagem Teste",
    isOwner: overrides.isOwner ?? true,
    system: { props },
    update: overrides.update ?? (async () => {}),
  };

  return actor;
}
