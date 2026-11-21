import {
    parseMetalBreathingState,
    resolveMetalIncomingAttackDefense,
} from './metal-breathing-service.mjs';
import { metalForgeBonuses } from './metal-forge-passive.mjs';
import { soundPassiveBonuses } from './sound-passive-service.mjs';
import { ruleVariant } from './rules-profile.mjs';

const PHYSICAL_DAMAGE = new Set(['cortante', 'perfurante', 'concussao']);

export function mitigateBreathingPassiveDamage(props, normalDamage, woundDamage, context = {}) {
    const canResist = !context.ignoreResistance && !context.approvalResisted;
    const resisted = canResist && metalForgeBonuses(props).concussionResistance;
    const typedResistance = canResist && context.typedResistance;
    let reduction = soundPassiveBonuses(props).physicalReduction;
    const metalized = parseMetalBreathingState(props.resp_metal_estado).metalized;
    let stoneSynergyReduction = context.isAttack === true && metalized?.turns > 0 &&
        ruleVariant('classes') === 'vanilla'
        ? Math.max(0, Math.trunc(Number(metalized.stoneSynergyReduction) || 0))
        : 0;
    const hasConcussion = context.damageTypes?.includes('concussao') ||
        context.components?.some(entry => entry.types?.includes('concussao'));
    if (!resisted && !typedResistance && !reduction && !stoneSynergyReduction && !hasConcussion)
        return { normalDamage, woundDamage, concussionDamage: 0 };

    const hasComponents = Array.isArray(context.components) && context.components.length > 0;
    const components = hasComponents ? normalizedComponents(context.components) : [];
    let concussionDamage = 0;
    const groups = [false, true].map(wound => {
        const amount = wound ? woundDamage : normalDamage;
        if (!amount) return 0;
        const entries = components.filter(entry => entry.types.includes('ferida') === wound);
        const componentTotal = entries.reduce((sum, entry) => sum + entry.subtotal, 0);
        const attributed = hasComponents ? Math.min(amount, componentTotal) : amount;
        const portions = entries.length ? entries : [{ types: context.damageTypes ?? [], subtotal: attributed }];
        let cumulative = 0;
        let assigned = 0;
        let resolved = amount - attributed;
        for (const portion of portions) {
            cumulative += portion.subtotal;
            const next = Math.floor(cumulative * attributed / (componentTotal || attributed || 1));
            let subtotal = next - assigned;
            assigned = next;
            const types = portion.types.filter(type => !context.approvedTypes || context.approvedTypes.includes(type));
            if ((resisted && types.includes('concussao')) || (typedResistance && types.includes(typedResistance)))
                subtotal = Math.floor(subtotal / 2);
            if (stoneSynergyReduction > 0) {
                const used = Math.min(stoneSynergyReduction, subtotal);
                subtotal -= used;
                stoneSynergyReduction -= used;
            }
            if (reduction > 0 && types.some(type => PHYSICAL_DAMAGE.has(type))) {
                const used = Math.min(reduction, subtotal);
                subtotal -= used;
                reduction -= used;
            }
            if (types.includes('concussao')) concussionDamage += subtotal;
            resolved += subtotal;
        }
        const extraReduction = Math.min(stoneSynergyReduction, amount - attributed);
        stoneSynergyReduction -= extraReduction;
        return resolved - extraReduction;
    });
    return { normalDamage: groups[0], woundDamage: groups[1], concussionDamage };
}

function normalizedComponents(components = []) {
    return components.map((component) => ({
        ...component,
        types: Array.isArray(component.types) ? component.types : [],
        subtotal: Math.max(0, Math.trunc(Number(component.subtotal) || 0)),
    }));
}

export function resolveBreathingDefense({
    amount = 0,
    components = [],
    damageTypes = [],
    props = {},
    suppressResistances = false,
} = {}) {
    const incoming = Math.max(0, Math.trunc(Number(amount) || 0));
    const preparedMetal = parseMetalBreathingState(props.resp_metal_estado);
    const steel = resolveMetalIncomingAttackDefense(preparedMetal);
    const metal = steel.state;
    const patches = {};

    if (steel.consumed) Object.assign(patches, steel.patch);
    if (steel.effect?.negateAttack) {
        return {
            amount: 0,
            components: normalizedComponents(components).map((entry) => ({
                ...entry,
                subtotal: 0,
            })),
            resisted: false,
            negated: true,
            counterAttackAvailable: steel.effect.counterAttack === true,
            patches,
        };
    }

    const resistances = new Set(
        suppressResistances
            ? []
            : [...(metal.unshakable?.turns > 0 ? (metal.unshakable.resistances ?? []) : [])]
    );
    const source = normalizedComponents(components);
    if (resistances.size === 0)
        return { amount: incoming, components: source, resisted: false, negated: false, patches };

    if (source.length === 0) {
        const resisted = damageTypes.some((type) => resistances.has(type));
        return {
            amount: resisted ? Math.floor(incoming / 2) : incoming,
            components: source,
            resisted,
            negated: false,
            patches,
        };
    }

    const componentTotal = source.reduce((total, component) => total + component.subtotal, 0);
    const extras = Math.max(0, incoming - componentTotal);
    let resisted = false;
    const resolved = source.map((component) => {
        const applies = component.types.some((type) => resistances.has(type));
        if (applies) resisted = true;
        return {
            ...component,
            subtotal: applies ? Math.floor(component.subtotal / 2) : component.subtotal,
        };
    });
    return {
        amount: extras + resolved.reduce((total, component) => total + component.subtotal, 0),
        components: resolved,
        resisted,
        negated: false,
        patches,
    };
}
