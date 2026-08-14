import { parseAttributeValue, parseNumber } from "../parsing.mjs";
import { weaponProfilesForActor } from "../weapon-service.mjs";
import { normalizeBreathingTechnique, normalizeWeaponTechnique } from "./item-technique-normalizers.mjs";

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
  return item?.system?.template === WEAPON_TEMPLATE_ID || Array.isArray(props.arma_perfis_ataque);
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
  return (definition?.damage ?? []).map((component) => ({
    sourceId: definition.id,
    sourceLabel: component.label || definition.name,
    tipoAcao: action,
    dado: resolvedFormula(component.formula, values),
    fixo: componentFixed(component, values),
    attrs: [],
    tiposDano: [...(component.types ?? [])],
  }));
}

export function createAttackBuilderModel(actor) {
  const actorProps = actor?.system?.props ?? {};
  const breathingLevel = selectedLevel(actor);
  const weapons = [];
  const breathing = [];

  for (const item of itemsOf(actor)) {
    const props = itemProps(item);
    if (isWeapon(item)) {
      const profiles = weaponProfilesForActor(props, actorProps);
      profiles.forEach((profile, profileIndex) => {
        const normalized = normalizeWeaponTechnique({ ...item, system: { ...item.system, props: { ...props, arma_perfis_ataque: profiles } } }, { profileIndex });
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

    if (isBreathingForm(item)) {
      const normalized = normalizeBreathingTechnique(item, { level: breathingLevel });
      if (!normalized.ok || normalized.definition.metadata.passive || normalized.definition.damage.length === 0) continue;
      breathing.push({
        key: item.uuid ?? item.id ?? item.name,
        item,
        label: `${props.respiracao_nome} — ${props.nome_forma || item.name} (Nível ${breathingLevel})`,
        definition: normalized.definition,
      });
    }
  }

  return { actor, breathingLevel, weapons, breathing };
}

export function buildAttackSelection(model, { weaponKey = "", breathingKey = "", manual = false } = {}) {
  if (manual) return { cancelled: false, manual: true, nome: "", entradas: [], pdrCusto: 0 };
  const weapon = model.weapons.find((entry) => entry.key === weaponKey) ?? null;
  const breath = model.breathing.find((entry) => entry.key === breathingKey) ?? null;
  const definitions = [weapon?.definition, breath?.definition].filter(Boolean);
  const entradas = definitions.flatMap((definition) => definitionDamageEntries(definition, model.actor));
  if (weapon && breath) {
    const breathingAction = breath.definition.costs.actions?.[0]?.type;
    if (breathingAction) {
      for (const entry of entradas.filter((candidate) => candidate.sourceId === weapon.definition.id)) entry.tipoAcao = "";
    }
  }
  const pdrCusto = definitions.flatMap((definition) => definition.costs.resources ?? [])
    .filter((cost) => cost.resource === "pdr")
    .reduce((total, cost) => total + Number(cost.amount ?? 0), 0);
  const names = [weapon?.label, breath?.label].filter(Boolean);
  return { cancelled: false, manual: false, nome: names.join(" + "), entradas, pdrCusto };
}

function optionsHtml(entries, emptyLabel) {
  return `<option value="">${emptyLabel}</option>${entries.map((entry) => `<option value="${entry.key}">${entry.label}</option>`).join("")}`;
}

export async function openAttackBuilder(actor) {
  const model = createAttackBuilderModel(actor);
  if (model.weapons.length === 0 && model.breathing.length === 0) return buildAttackSelection(model, { manual: true });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Montar Ataque — Night Assassins" },
    modal: true,
    rejectClose: false,
    content: `<div class="na-attack-builder">
      <p>Escolha as fontes do ataque. As parcelas permanecem separadas para crítico, resistência e Ferida.</p>
      <label>Arma / Perfil</label>
      <select name="weaponKey">${optionsHtml(model.weapons, "— Sem arma —")}</select>
      <label>Forma de Respiração</label>
      <select name="breathingKey">${optionsHtml(model.breathing, "— Sem Respiração —")}</select>
    </div>`,
    buttons: [
      { action: "continue", label: "Continuar", callback: (_event, button) => buildAttackSelection(model, {
        weaponKey: button.form.elements.weaponKey.value,
        breathingKey: button.form.elements.breathingKey.value,
      }) },
      { action: "manual", label: "Dano Manual", callback: () => buildAttackSelection(model, { manual: true }) },
      { action: "cancel", label: "Cancelar", callback: () => ({ cancelled: true }) },
    ],
  });
  return result ?? { cancelled: true };
}
