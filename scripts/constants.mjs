/**
 * @fileoverview Constantes canônicas do módulo Night Assassins CSB Automation.
 */

export const ATTRIBUTES = Object.freeze([
  { key: "vit", label: "VIT", name: "Vitalidade", color: "#36D67A" },
  { key: "dex", label: "DEX", name: "Destreza", color: "#28D7FF" },
  { key: "for", label: "FOR", name: "Força", color: "#C1000C" },
  { key: "car", label: "CAR", name: "Carisma", color: "#FF9100" },
  { key: "fdv", label: "FDV", name: "Força de Vontade", color: "#BB97F9" },
  { key: "int", label: "INT", name: "Inteligência", color: "#F8EB4D" },
  { key: "sab", label: "SAB", name: "Sabedoria", color: "#D45CA4" },
]);

export const ATTR_NAMES = Object.freeze(
  Object.fromEntries(ATTRIBUTES.map((a) => [a.key, a.label]))
);

export const ATTR_COLORS = Object.freeze(
  Object.fromEntries(ATTRIBUTES.map((a) => [a.key, a.color]))
);

export const SNAPSHOT_LEVELS = Object.freeze([1, 3, 7]);
export const ATTRIBUTE_GAIN_LEVELS = Object.freeze([3, 7]);
export const STANDARD_POOL = Object.freeze([4, 3, 2, 2, 1, 1, 1]);

export const PROP_KEYS = Object.freeze({
  level: "nvl_pj",
  ability: "hab_escolhida",
  markAttribute: "hab_marca_destino_atributo",
  markBonus: "hab_marca_destino_bonus",
  schemaVersion: "na_automacao_versao_dados",
  acertoLabel: "acerto_label",
  pdrGasto: "pdr_slayer_gasto_valor",
  pdvDano: "pdv_slayer_dano",
});

export const ABILITY_OPTIONS = Object.freeze([
  { key: "hab_escolhida_base", label: "Escolha" },
  { key: "hab_escolhida_sem", label: "Sem Habilidade" },
  { key: "hab_escolhida_tato", label: "Tato Sensitivo" },
  { key: "hab_escolhida_audicao", label: "Audição Sobrenatural" },
  { key: "hab_escolhida_visao", label: "Visão Aguçada" },
  { key: "hab_escolhida_olfato", label: "Olfato Sobrenatural" },
  { key: "hab_escolhida_metamorfose", label: "Metamorfose Carnívora" },
  { key: "hab_escolhida_tsuyoi", label: "Tsuyoi — O Inabalável" },
  { key: "hab_escolhida_marechi", label: "Marechi — O Sangue Raro" },
  { key: "hab_escolhida_oketsu", label: "Ōketsu — O Sangue Real" },
  { key: "hab_escolhida_marca_destino", label: "Marca do Destino" },
]);

export const TIPOS_ACAO = Object.freeze([
  { key: "ataque", label: "Ação de Ataque", desc: "1 por turno. Ataque Padrão ou técnicas de ataque." },
  { key: "especial", label: "Ação Especial", desc: "1 por turno. Técnicas de Ação Especial." },
  { key: "unica", label: "Ação Única", desc: "1 por RODADA. Nenhum efeito pode dar mais de uma." },
  { key: "completa", label: "Ação Completa", desc: "Consome Movimento + Ataque." },
  { key: "reacao", label: "Reação", desc: "1 por rodada. Reage a ataques como alvo." },
  { key: "livre", label: "Ação Livre", desc: "Limitada pelo Mestre. Sem efeito mecânico." },
]);

export const TIPOS_DANO = Object.freeze([
  { key: "cortante", label: "Cortante", cat: "comum", desc: "Reduzível e bloqueável. Dano por lâminas." },
  { key: "perfurante", label: "Perfurante", cat: "comum", desc: "Reduzível e bloqueável. Dano por pontas e projéteis." },
  { key: "concussao", label: "Concussão", cat: "comum", desc: "Reduzível e bloqueável. Dano por impacto e força bruta." },
  { key: "trovejante", label: "Trovejante", cat: "especial", desc: "Irredutível. Pode ser anulado, nunca reduzido." },
  { key: "sonoro", label: "Sonoro", cat: "especial", desc: "Inevitável. Não esquivado/bloqueado. Teste VIT (CD=10+DEX+FDV) para metade." },
  { key: "ferida", label: "Ferida", cat: "especial", desc: "Reduz o PDV MÁXIMO permanentemente. Não regenera." },
  { key: "sangramento", label: "Sangramento", cat: "especial", desc: "Dano por turno no início do turno do alvo." },
  { key: "envenenamento", label: "Envenenamento", cat: "especial", desc: "Dano por turno no início do turno do alvo." },
  { key: "necrotico", label: "Necrótico", cat: "especial", desc: "Incurável em combate. Só trata com descanso longo (mín. 24h)." },
]);

export const MODULE_ID = "night-assassins-csb-automation";
