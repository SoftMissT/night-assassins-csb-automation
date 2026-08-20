import { parseMetalBreathingState, resolveMetalIncomingAttackDefense } from "./metal-breathing-service.mjs";
import { parseStoneBreathingState } from "./stone-breathing-service.mjs";

function normalizedComponents(components = []) {
  return components.map((component) => ({
    ...component,
    types: Array.isArray(component.types) ? component.types : [],
    subtotal: Math.max(0, Math.trunc(Number(component.subtotal) || 0)),
  }));
}

export function resolveBreathingDefense({ amount = 0, components = [], damageTypes = [], props = {}, suppressResistances = false } = {}) {
  const incoming = Math.max(0, Math.trunc(Number(amount) || 0));
  const preparedMetal = parseMetalBreathingState(props.resp_metal_estado);
  const steel = resolveMetalIncomingAttackDefense(preparedMetal);
  const metal = steel.state;
  const stone = parseStoneBreathingState(props.resp_pedra_estado);
  const patches = {};

  if (steel.consumed) Object.assign(patches, steel.patch);
  if (steel.effect?.negateAttack) {
    return { amount: 0, components: normalizedComponents(components).map((entry) => ({ ...entry, subtotal: 0 })), resisted: false, negated: true, patches };
  }

  const resistances = new Set(suppressResistances ? [] : [
    ...(metal.unshakable?.turns > 0 ? metal.unshakable.resistances ?? [] : []),
    ...(stone.resilience?.turns > 0 || stone.resilience?.untilCombatEnd ? stone.resilience.resistances ?? [] : []),
  ]);
  const source = normalizedComponents(components);
  if (resistances.size === 0) return { amount: incoming, components: source, resisted: false, negated: false, patches };

  if (source.length === 0) {
    const resisted = damageTypes.some((type) => resistances.has(type));
    return { amount: resisted ? Math.floor(incoming / 2) : incoming, components: source, resisted, negated: false, patches };
  }

  const componentTotal = source.reduce((total, component) => total + component.subtotal, 0);
  const extras = Math.max(0, incoming - componentTotal);
  let resisted = false;
  const resolved = source.map((component) => {
    const applies = component.types.some((type) => resistances.has(type));
    if (applies) resisted = true;
    return { ...component, subtotal: applies ? Math.floor(component.subtotal / 2) : component.subtotal };
  });
  return { amount: extras + resolved.reduce((total, component) => total + component.subtotal, 0), components: resolved, resisted, negated: false, patches };
}
