import { normalizeTechniqueDefinition, validateTechniqueDefinition } from "../core/technique-definition.mjs";
import { weaponAttackAttributes, weaponPropertyKeys, weaponPropertyMechanics, weaponProfilesFromProps } from "../weapon-service.mjs";

const text = (value, fallback = "") => String(value ?? fallback).trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const list = (value) => Array.isArray(value) ? value : text(value) ? text(value).split(/\s*[,;]\s*/u).filter(Boolean) : [];
const propsOf = (item) => item?.system?.props ?? item?.props ?? item ?? {};

function actionKey(value) {
  const normalized = text(value).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
  if (normalized.includes("completa")) return "completa";
  if (normalized.includes("especial")) return "especial";
  if (normalized.includes("ataque")) return "ataque";
  if (normalized.includes("movimento")) return "movimento";
  if (normalized.includes("unica")) return "unica";
  if (normalized.includes("reacao")) return "reacao";
  if (normalized.includes("livre")) return "livre";
  return "";
}

function rangeMeters(value) {
  const match = text(value).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*m\b/iu);
  return match ? Number(match[1]) : null;
}

function weaponDamage(profile = {}) {
  return [{
    id: "weapon-base",
    label: text(profile.nome, "Dano da arma"),
    formula: text(profile.dano_dados),
    fixed: number(profile.dano_fixo),
    attributeTerms: list(profile.atributos).map((rule) => ({
      key: text(rule.key).toUpperCase(),
      multiplier: number(rule.multiplicador, 1),
      rounding: text(rule.rounding, "floor"),
      chooseGroup: rule.escolha === true ? "weapon-attribute-choice" : "",
    })),
    types: list(profile.tipos_dano),
    criticalPolicy: "double",
    resistancePolicy: "normal",
    woundPolicy: "by-type",
  }];
}

export function normalizeWeaponTechnique(item, { profileIndex = 0, ownerKind = "slayer", sourceItemUuid } = {}) {
  const props = propsOf(item);
  const profiles = weaponProfilesFromProps(props);
  const profile = profiles[profileIndex] ?? profiles[0] ?? {
    nome: "Ataque Base",
    dano_dados: props.arma_dano_dados,
    dano_fixo: props.arma_dano_fixo,
    atributos: list(props.arma_dano_atributo).map((key) => ({ key, multiplicador: 1 })),
    tipos_dano: props.arma_tipos_dano,
    alcance: props.arma_alcance,
  };
  const attributes = list(profile.atributos);
  const attackAttributes = weaponAttackAttributes(props, profile);
  const propertyKeys = weaponPropertyKeys(props.arma_propriedades);
  const propertyMechanics = weaponPropertyMechanics(props);
  const definition = normalizeTechniqueDefinition({
    id: `weapon:${text(props.arma_nome, item?.name || "unnamed")}:${profileIndex}`,
    name: `${text(props.arma_nome, item?.name || "Arma")} ${text(profile.nome, "Ataque Base")}`,
    sourceFamily: "weapon",
    sourceItemUuid: sourceItemUuid ?? item?.uuid ?? "",
    ownerKind,
    requirements: Array.isArray(props.arma_requisitos_estruturados) ? props.arma_requisitos_estruturados : [],
    costs: { actions: [{ type: "ataque", amount: 1, timing: "reserve", refund: "cancel" }], resources: [] },
    targeting: { mode: "single", count: 1, range: rangeMeters(profile.alcance ?? props.arma_alcance), disposition: "enemy" },
    attack: {
      attribute: text(props.arma_atributo_acerto, attackAttributes[0] ?? attributes[0]?.key ?? "FOR"),
      count: Math.max(1, number(profile.ataques, propertyMechanics.some((mechanic) => ["nitoryu", "ryoto"].includes(mechanic?.id)) ? 2 : 1)),
      sequential: true,
      critical: { threshold: number(profile.critico, number(props.arma_critico, 20)), disabled: profile.critico_desabilitado === true, source: "weapon-profile" },
    },
    defense: { allowed: list(profile.defesas_permitidas ?? ["esquiva", "bloqueio"]), onSuccess: text(profile.defesa_sucesso, "negate") },
    damage: weaponDamage(profile),
    statuses: Array.isArray(profile.status_estruturados) ? profile.status_estruturados : [],
    effects: Array.isArray(profile.efeitos_estruturados) ? profile.efeitos_estruturados : [],
    lifecycle: { scope: "instant" },
    chat: { summary: text(profile.formula_texto, props.arma_nome) },
    metadata: {
      category: text(props.arma_categoria, "basica"),
      profileIndex,
      attackAttributes,
      properties: propertyKeys,
      unresolvedRuleText: text(props.arma_regra_completa || props.descricao),
      structuredMechanics: propertyMechanics,
      weaponMode: text(profile.modo ?? profile.modo_propriedade),
      secondaryDamagePolicy: text(profile.dano_segundo_golpe, "normal"),
      secondaryNoAttribute: profile.acerto_segundo_sem_atributo === true,
      secondaryPenalty: number(profile.penalidade_segundo_acerto),
      criticalChain: profile.cadeia_critica && typeof profile.cadeia_critica === "object" ? structuredClone(profile.cadeia_critica) : null,
    },
  });
  return validateTechniqueDefinition(definition);
}

export function normalizeBreathingTechnique(item, { level = 1, ownerKind = "slayer", sourceItemUuid } = {}) {
  const props = propsOf(item);
  const selectedLevel = Math.min(4, Math.max(1, Math.trunc(number(level, 1))));
  const prefix = `nvl${selectedLevel}`;
  const formula = text(props[`${prefix}_dano`]);
  const types = list(props[`${prefix}_tipos_dano`] || props.tipo_dano_base);
  const rawStatus = text(props[`${prefix}_status`]);
  const action = actionKey(props.tipo_manobra);
  const passive = number(props.forma_passiva) === 1 || action === "" && /passiva/iu.test(text(props.tipo_manobra));
  const definition = normalizeTechniqueDefinition({
    id: `breathing:${text(props.forma_id, item?.id || "unnamed")}:level-${selectedLevel}`,
    name: `${text(props.respiracao_nome, "Respiração")} ${text(props.nome_forma, item?.name || "Forma")}`,
    sourceFamily: "breathing",
    sourceItemUuid: sourceItemUuid ?? item?.uuid ?? "",
    ownerKind,
    requirements: [
      { id: "breathing-level", kind: "minimum", key: "nvl_respiracao_num", operator: ">=", value: Math.max(selectedLevel, number(props.nivel_req, 1)), reason: "Nível de Respiração insuficiente." },
      ...(Array.isArray(props.requisitos_estruturados) ? props.requisitos_estruturados : []),
    ],
    costs: {
      actions: passive || !action ? [] : [{ type: action, amount: 1, timing: "reserve", refund: "cancel" }],
      resources: number(props[`${prefix}_custo`]) > 0 ? [{ resource: "pdr", amount: number(props[`${prefix}_custo`]), timing: "reserve", refund: "cancel" }] : [],
    },
    targeting: props[`${prefix}_alvo_estruturado`] ?? { mode: formula || rawStatus ? "single" : "self", count: 1, disposition: formula || rawStatus ? "enemy" : "self" },
    attack: passive || props[`${prefix}_sem_acerto`] === true ? null : {
      attribute: text(props[`${prefix}_atributo_acerto`], "DEX"),
      count: Math.max(1, number(props[`${prefix}_acertos`], 1)),
      sequential: true,
      critical: { threshold: number(props[`${prefix}_critico`], 20), source: "weapon" },
    },
    defense: props[`${prefix}_defesa_estruturada`] ?? (passive ? null : { allowed: ["esquiva", "bloqueio"], onSuccess: "negate" }),
    damage: formula ? [{
      id: `${props.forma_id || "form"}-damage`, formula, types,
      criticalPolicy: text(props[`${prefix}_critico_politica`], "double"),
      resistancePolicy: text(props[`${prefix}_resistencia_politica`], "normal"),
      woundPolicy: "by-type",
    }] : [],
    statuses: Array.isArray(props[`${prefix}_status_estruturados`])
      ? props[`${prefix}_status_estruturados`]
      : rawStatus ? [{ id: rawStatus, lifecycle: { scope: "manual" } }] : [],
    effects: Array.isArray(props[`${prefix}_efeitos_estruturados`]) ? props[`${prefix}_efeitos_estruturados`] : [],
    lifecycle: props[`${prefix}_ciclo_estruturado`] ?? { scope: "instant" },
    chat: { summary: text(props[`${prefix}_efeito`], props.descricao) },
    metadata: {
      breathing: text(props.respiracao_nome), formId: text(props.forma_id), level: selectedLevel, passive,
      unresolvedRequirementText: text(props.requisito_texto), unresolvedComboText: text(props.combo_texto),
    },
  });
  return validateTechniqueDefinition(definition);
}
