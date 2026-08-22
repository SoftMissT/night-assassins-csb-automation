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
  pdvDano: "pdv_slayer_dano_tomado",
});

export const ABILITY_OPTIONS = Object.freeze([
  { key: "hab_escolhida_base", label: "Escolha" },
  { key: "hab_escolhida_sem", label: "Sem Habilidade" },
  { key: "hab_escolhida_tato", label: "Tato Sensitivo" },
  { key: "hab_escolhida_audicao", label: "Audição Sobrenatural" },
  { key: "hab_escolhida_visao", label: "Visão Aguçada" },
  { key: "hab_escolhida_olfato", label: "Olfato Sobrenatural" },
  { key: "hab_escolhida_metamorfose", label: "Metamorfose Carnívora" },
  { key: "hab_escolhida_tsuyoi", label: "Tsuyoi O Inabalável" },
  { key: "hab_escolhida_marechi", label: "Marechi O Sangue Raro" },
  { key: "hab_escolhida_oketsu", label: "Ōketsu O Sangue Real" },
  { key: "hab_escolhida_marca_destino", label: "Marca do Destino" },
]);

export const TIPOS_ACAO = Object.freeze([
  { key: "movimento", label: "Ação de Movimento", scope: "turn", damage: false, desc: "1 por turno. Movimento máximo: 7m + DEX." },
  { key: "ataque", label: "Ação de Ataque", scope: "turn", damage: true, desc: "1 por turno. Ataque Padrão ou técnicas de ataque." },
  { key: "especial", label: "Ação Especial", scope: "turn", damage: true, desc: "1 por turno. Técnicas de Ação Especial." },
  { key: "unica", label: "Ação Única", scope: "round", damage: true, desc: "1 por rodada. Nenhum efeito pode dar mais de uma." },
  { key: "completa", label: "Ação Completa", scope: "composite", damage: true, desc: "Consome Movimento + Ataque." },
  { key: "reacao", label: "Reação", scope: "round", damage: true, desc: "1 por rodada. Reage a ataques como alvo." },
  { key: "defesa", label: "Defesa", scope: "free", damage: false, desc: "Ilimitada quando o personagem é alvo." },
  { key: "livre", label: "Ação Livre", scope: "free", damage: false, desc: "Limitada pelo Mestre. Sem efeito mecânico." },
  { key: "epica", label: "Ação Épica", scope: "special", damage: true, desc: "Tudo ou Nada. Exige autorização e resolução própria do Mestre." },
  { key: "lendaria", label: "Ação Lendária", scope: "gm-round", damage: true, desc: "1 por rodada. Exclusiva de chefes Oni e controlada pelo Mestre." },
  { key: "covil", label: "Ação de Covil", scope: "gm-round", damage: true, desc: "Evento ambiental na contagem 20 da iniciativa." },
  { key: "vilao", label: "Ação de Vilão", scope: "gm-phase", damage: false, desc: "Evento de mudança de fase do chefe; limpa status negativos e libera capacidades." },
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
  { key: "acido", label: "Ácido", cat: "elemental", desc: "Ignora Bloqueio e pode aplicar Corroído." },
  { key: "colapso", label: "Colapso", cat: "elemental", desc: "Pode desconectar o controle motor do alvo." },
  { key: "congelante", label: "Congelante", cat: "elemental", desc: "Pode aplicar Hipotermia." },
  { key: "eletrico", label: "Elétrico", cat: "elemental", desc: "Pode impedir Reações até o próximo turno." },
  { key: "fogo", label: "Fogo", cat: "elemental", desc: "Pode aplicar Em Chamas." },
  { key: "impacto", label: "Impacto", cat: "elemental", desc: "Ignora RD de escudo/barreira e pode atordoar ou derrubar." },
  { key: "mental", label: "Mental", cat: "elemental", desc: "Pode aplicar Atordoamento ou Confuso." },
  { key: "solar", label: "Solar", cat: "elemental", desc: "Suprime a regeneração de Onis." },
  { key: "venenoso", label: "Venenoso", cat: "elemental", desc: "Pode aplicar Envenenamento." },
]);

export const STATUS_SLAYER = Object.freeze([
  { key: "vantagem", label: "Vantagem", category: "Rolagem" },
  { key: "desvantagem", label: "Desvantagem", category: "Rolagem" },
  { key: "sangramento", label: "Sangramento", category: "Dano contínuo" },
  { key: "hemorragia", label: "Hemorragia", category: "Dano contínuo" },
  { key: "envenenamento", label: "Envenenamento", category: "Dano contínuo" },
  { key: "corroido", label: "Corroído", category: "Dano contínuo" },
  { key: "em_chamas", label: "Em Chamas", category: "Dano contínuo" },
  { key: "invisivel_inalvejavel", label: "Invisível / Inalvejável", category: "Defesa" },
  { key: "vulneravel", label: "Vulnerável", category: "Dano amplificado" },
  { key: "restricao_movimentos", label: "Restrição de Movimentos", category: "Mobilidade" },
  { key: "hipotermia", label: "Hipotermia", category: "Mobilidade" },
  { key: "atordoamento", label: "Atordoamento", category: "Incapacitação" },
  { key: "paralisia", label: "Paralisia", category: "Incapacitação" },
  { key: "colapso", label: "Colapso", category: "Incapacitação" },
  { key: "derrubado", label: "Derrubado", category: "Incapacitação" },
  { key: "sem_reacao", label: "Sem Reação", category: "Incapacitação" },
  { key: "confuso", label: "Confuso", category: "Incapacitação" },
  { key: "fratura", label: "Fratura", category: "Incapacitação" },
  { key: "sonhando", label: "Sonhando", category: "Incapacitação" },
  { key: "amedrontado", label: "Amedrontado", category: "Psicológico" },
  { key: "frenesi", label: "Frenesi (Berserk)", category: "Psicológico" },
  { key: "desequilibrado", label: "Desequilibrado", category: "Posicionamento e foco" },
  { key: "desorientado", label: "Desorientado", category: "Posicionamento e foco" },
  { key: "distraido", label: "Distraído", category: "Posicionamento e foco" },
  { key: "empurrado", label: "Empurrado", category: "Posicionamento e foco" },
  { key: "flanqueado", label: "Flanqueado", category: "Posicionamento e foco" },
  { key: "cegueira_parcial", label: "Cegueira Parcial", category: "Sensorial" },
  { key: "surdez_parcial", label: "Surdez Parcial", category: "Sensorial" },
  { key: "corrupcao", label: "Corrupção", category: "Espiritual e sobrenatural", stackable: true },
  { key: "regeneracao_suprimida", label: "Regeneração Suprimida", category: "Espiritual e sobrenatural" },
  { key: "silenciado", label: "Silenciado", category: "Espiritual e sobrenatural" },
  { key: "suprimido", label: "Suprimido", category: "Espiritual e sobrenatural" },
  { key: "fadiga_corporal", label: "Fadiga Corporal", category: "Fadiga" },
  { key: "fadiga_espiritual", label: "Fadiga Espiritual", category: "Fadiga" },
  { key: "fadiga_mental", label: "Fadiga Mental", category: "Fadiga" },
  { key: "encorajado", label: "Encorajado", category: "Benéfico" },
  { key: "ofegante", label: "Ofegante", category: "Respiração" },
]);

/** Status que realmente causam dano automático no início do turno. */
export const STATUS_SLAYER_DANO_CONTINUO = Object.freeze([
  "sangramento",
  "hemorragia",
  "envenenamento",
  "corroido",
  "em_chamas",
]);

export const MODULE_ID = "night-assassins-csb-automation";
