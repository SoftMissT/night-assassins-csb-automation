import { parseAttributeValue, parseNumber } from "../parsing.mjs";
import { weaponProfilesForActor } from "../weapon-service.mjs";
import { normalizeBreathingTechnique, normalizeWeaponTechnique } from "./item-technique-normalizers.mjs";
import { actorKind } from "../actor-kind.mjs";
import { oniUnarmedProfile } from "../oni/progression-service.mjs";

const WEAPON_TEMPLATE_ID = "NAWeaponTpl00001";
const BREATH_TEMPLATE_ID = "NABreathTpl00001";

function itemsOf(actor) {
  return [...(actor?.items ?? [])];
}

function itemProps(item) {
  return item?.system?.props ?? {};
}

function isWeapon(item) {
  const props = itemProps(item);
  return item?.system?.template === WEAPON_TEMPLATE_ID
    || props.arma_critico !== undefined
    || Boolean(props.arma_nome && (props.arma_dano_fixo !== undefined || props.arma_dano_atributo !== undefined || props.arma_tipos_dano !== undefined));
}

function isBreathingForm(item) {
  const props = itemProps(item);
  return item?.system?.template === BREATH_TEMPLATE_ID || Boolean(props.forma_id && props.respiracao_nome);
}

function attributeValues(actor) {
  const props = actor?.system?.props ?? {};
  return Object.fromEntries(["vit", "dex", "for", "car", "fdv", "int", "sab"].map((key) => [key, parseAttributeValue(props[`${key}_display`])]));
}

function selectedLevel(actor) {
  const props = actor?.system?.props ?? {};
  return Math.min(4, Math.max(1, Math.trunc(parseNumber(props.nvl_respiracao_num) || 1)));
}

function oniLevel(actor) {
  const props = actor?.system?.props ?? {};
  return Math.max(1, Math.trunc(parseNumber(props.nvl_num ?? props.nivel_oni_num ?? props.nvl_pj) || 1));
}

function oniUnarmedDefinitions(actor) {
  const level = oniLevel(actor);
  const make = (id, name, style, types) => {
    const profile = oniUnarmedProfile(level, style);
    const [base] = profile.formula.split("+");
    const die = /d/iu.test(base) ? base : "";
    return ({
    id: `oni-unarmed:${id}:level-${level}`, name, ownerKind: "oni",
    costs: { actions: [{ type: "ataque", amount: 1 }], resources: [] },
    damage: [{ id, label: name, formula: die, fixed: die ? 0 : Number(base), attributeTerms: [{ key: profile.attribute, multiplier: 1, rounding: "floor" }], types }],
    });
  };
  return [make("martial", "Ataque Marcial", "martial", ["concussao"]), make("claw", "Garras", "claw", ["cortante"]), make("bite", "Mordida", "bite", ["perfurante"])]
    .map((definition) => ({ key: definition.id, label: `${definition.name} — Nível ${level}`, definition }));
}

function roundedTerm(term, values) {
  const raw = (values[String(term.key ?? "").toLowerCase()] ?? 0) * Number(term.multiplier ?? 1);
  if (term.rounding === "ceil") return Math.ceil(raw);
  if (term.rounding === "round") return Math.round(raw);
  if (term.rounding === "none") return raw;
  return Math.floor(raw);
}

function componentFixed(component, values) {
  const grouped = new Map();
  let total = Number(component.fixed ?? 0);
  for (const term of component.attributeTerms ?? []) {
    const value = roundedTerm(term, values);
    if (!term.chooseGroup) total += value;
    else grouped.set(term.chooseGroup, Math.max(grouped.get(term.chooseGroup) ?? Number.NEGATIVE_INFINITY, value));
  }
  for (const value of grouped.values()) total += Number.isFinite(value) ? value : 0;
  return total;
}

function resolvedFormula(formula, values) {
  return String(formula ?? "").replace(/@([a-z_]+)/giu, (_match, key) => String(values[String(key).toLowerCase()] ?? 0));
}

export function definitionDamageEntries(definition, actor) {
  const values = attributeValues(actor);
  const action = definition?.costs?.actions?.[0]?.type ?? "";
  const attackCount = Math.max(1, Math.trunc(Number(definition?.attack?.count) || 1));
  return Array.from({ length: attackCount }, (_unused, attackIndex) => (definition?.damage ?? []).map((component) => {
    const secondaryAttack = attackIndex > 0;
    const secondaryComponent = secondaryAttack ? { ...component, attributeTerms: [] } : component;
    return {
      sourceId: definition.id,
      sourceLabel: `${component.label || definition.name}${attackCount > 1 ? ` — Golpe ${attackIndex + 1}` : ""}`,
      tipoAcao: action,
      dado: resolvedFormula(component.formula, values),
      fixo: componentFixed(secondaryComponent, values),
      attrs: [],
      tiposDano: [...(component.types ?? [])],
    };
  })).flat();
}

export function createAttackBuilderModel(actor) {
  const actorProps = actor?.system?.props ?? {};
  const ownerKind = actorKind(actor);
  const breathingLevel = selectedLevel(actor);
  const weapons = [];
  const breathing = [];
  const innate = ownerKind === "oni" ? oniUnarmedDefinitions(actor) : [];

  for (const item of itemsOf(actor)) {
    const props = itemProps(item);
    if (isWeapon(item)) {
      const profiles = weaponProfilesForActor(props, actorProps);
      profiles.forEach((profile, profileIndex) => {
        const normalized = normalizeWeaponTechnique({ ...item, system: { ...item.system, props: { ...props, arma_perfis_ataque: profiles } } }, { profileIndex, ownerKind: ownerKind ?? "slayer" });
        if (!normalized.ok || normalized.definition.damage.length === 0) return;
        weapons.push({
          key: `${item.uuid ?? item.id ?? item.name}::${profileIndex}`,
          item,
          profileIndex,
          label: `${props.arma_nome || item.name} — ${profile.nome || `Perfil ${profileIndex + 1}`}`,
          definition: normalized.definition,
        });
      });
    }

    if (ownerKind === "slayer" && isBreathingForm(item)) {
      const normalized = normalizeBreathingTechnique(item, { level: breathingLevel, ownerKind });
      if (!normalized.ok || normalized.definition.metadata.passive || normalized.definition.damage.length === 0) continue;
      breathing.push({
        key: item.uuid ?? item.id ?? item.name,
        item,
        label: `${props.respiracao_nome} — ${props.nome_forma || item.name} (Nível ${breathingLevel})`,
        definition: normalized.definition,
      });
    }
  }

  return { actor, ownerKind, breathingLevel, weapons, breathing, innate };
}

export function buildAttackSelection(model, { weaponKey = "", breathingKey = "", innateKey = "", manual = false } = {}) {
  if (manual) return { cancelled: false, manual: true, nome: "", entradas: [], resourceCost: 0 };
  const weapon = model.weapons.find((entry) => entry.key === weaponKey) ?? null;
  const breath = model.breathing.find((entry) => entry.key === breathingKey) ?? null;
  const innate = model.innate.find((entry) => entry.key === innateKey) ?? null;
  const definitions = [weapon?.definition, breath?.definition, innate?.definition].filter(Boolean);
  const entradas = definitions.flatMap((definition) => definitionDamageEntries(definition, model.actor));
  if (weapon && breath) {
    const breathingAction = breath.definition.costs.actions?.[0]?.type;
    if (breathingAction) {
      for (const entry of entradas.filter((candidate) => candidate.sourceId === weapon.definition.id)) entry.tipoAcao = "";
    }
  }
  const resourceKey = model.ownerKind === "oni" ? "pdk" : "pdr";
  const resourceCost = definitions.flatMap((definition) => definition.costs.resources ?? [])
    .filter((cost) => cost.resource === resourceKey || model.ownerKind === "oni" && cost.resource === "pdr")
    .reduce((total, cost) => total + Number(cost.amount ?? 0), 0);
  const names = [weapon?.label, breath?.label, innate?.label].filter(Boolean);
  return { cancelled: false, manual: false, nome: names.join(" + "), entradas, resourceCost, resourceKey, weaponItem: weapon?.item ?? null };
}

function optionsHtml(entries, emptyLabel) {
  return `<option value="">${emptyLabel}</option>${entries.map((entry) => `<option value="${entry.key}">${entry.label}</option>`).join("")}`;
}

export async function openAttackBuilder(actor) {
  const model = createAttackBuilderModel(actor);
  if (model.weapons.length === 0 && model.breathing.length === 0 && model.innate.length === 0) return buildAttackSelection(model, { manual: true });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Montar Ataque — Night Assassins" },
    modal: true,
    rejectClose: false,
    content: `<div class="na-attack-builder">
      <p>Escolha as fontes do ataque. As parcelas permanecem separadas para crítico, resistência e Ferida.</p>
      <label>Arma / Perfil</label>
      <select name="weaponKey">${optionsHtml(model.weapons, "— Sem arma —")}</select>
      ${model.ownerKind === "oni" ? `<label>Ataque Demoníaco</label><select name="innateKey">${optionsHtml(model.innate, "— Sem ataque desarmado —")}</select>` : `<label>Forma de Respiração</label><select name="breathingKey">${optionsHtml(model.breathing, "— Sem Respiração —")}</select>`}
    </div>`,
    buttons: [
      { action: "continue", label: "Continuar", callback: (_event, button) => buildAttackSelection(model, {
        weaponKey: button.form.elements.weaponKey.value,
        breathingKey: button.form.elements.breathingKey?.value ?? "",
        innateKey: button.form.elements.innateKey?.value ?? "",
      }) },
      { action: "manual", label: "Dano Manual", callback: () => buildAttackSelection(model, { manual: true }) },
      { action: "cancel", label: "Cancelar", callback: () => ({ cancelled: true }) },
    ],
  });
  return result ?? { cancelled: true };
}
