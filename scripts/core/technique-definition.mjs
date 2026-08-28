export const TECHNIQUE_DEFINITION_VERSION = 1;

export const SOURCE_FAMILIES = Object.freeze(['weapon', 'breathing', 'kekkijutsu', 'equipment']);
export const OWNER_KINDS = Object.freeze(['slayer', 'oni', 'both']);
export const LIFECYCLE_SCOPES = Object.freeze([
    'instant',
    'turn',
    'round',
    'combat',
    'mission',
    'session',
    'permanent',
    'manual',
]);
export const PAYMENT_TIMINGS = Object.freeze(['reserve', 'on-use', 'on-hit', 'on-effect']);
export const REFUND_POLICIES = Object.freeze(['none', 'cancel', 'miss', 'no-effect']);
export const CRITICAL_POLICIES = Object.freeze(['double', 'none', 'maximize', 'custom']);
export const RESISTANCE_POLICIES = Object.freeze(['normal', 'ignore', 'half', 'custom']);
export const WOUND_POLICIES = Object.freeze(['by-type', 'never', 'always', 'custom']);

const asText = (value, fallback = '') => String(value ?? fallback).trim();
const asNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const asInteger = (value, fallback = 0) => Math.trunc(asNumber(value, fallback));
const asArray = (value) =>
    Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const uniqueText = (value) => [
    ...new Set(
        asArray(value)
            .map((entry) => asText(entry))
            .filter(Boolean)
    ),
];

function normalizeLifecycle(raw = {}, fallbackScope = 'instant') {
    const input = typeof raw === 'string' ? { scope: raw } : (raw ?? {});
    const scope = LIFECYCLE_SCOPES.includes(input.scope) ? input.scope : fallbackScope;
    const duration = input.duration == null ? null : Math.max(0, asInteger(input.duration));
    return {
        scope,
        duration,
        tick: ['start', 'end', 'immediate', 'none'].includes(input.tick) ? input.tick : 'none',
        expiresOn: uniqueText(input.expiresOn),
        resetKey: asText(input.resetKey),
    };
}

function normalizeRequirement(raw = {}, index = 0) {
    return {
        id: asText(raw.id, `requirement-${index + 1}`),
        kind: asText(raw.kind, 'property'),
        key: asText(raw.key),
        operator: asText(raw.operator, 'equals'),
        value: raw.value ?? true,
        reason: asText(raw.reason),
    };
}

function normalizeActionCost(raw = {}, index = 0) {
    const input = typeof raw === 'string' ? { type: raw } : (raw ?? {});
    return {
        id: asText(input.id, `action-${index + 1}`),
        type: asText(input.type),
        amount: Math.max(0, asInteger(input.amount, 1)),
        timing: PAYMENT_TIMINGS.includes(input.timing) ? input.timing : 'reserve',
        refund: REFUND_POLICIES.includes(input.refund) ? input.refund : 'cancel',
    };
}

function normalizeResourceCost(raw = {}, index = 0) {
    return {
        id: asText(raw.id, `resource-${index + 1}`),
        resource: asText(raw.resource),
        amount: Math.max(0, asNumber(raw.amount)),
        timing: PAYMENT_TIMINGS.includes(raw.timing) ? raw.timing : 'reserve',
        refund: REFUND_POLICIES.includes(raw.refund) ? raw.refund : 'cancel',
        allowOverdraft: raw.allowOverdraft === true,
    };
}

function normalizeAttributeTerm(raw = {}) {
    return {
        key: asText(raw.key).toUpperCase(),
        multiplier: asNumber(raw.multiplier, 1),
        rounding: ['floor', 'ceil', 'round', 'none'].includes(raw.rounding)
            ? raw.rounding
            : 'floor',
        chooseGroup: asText(raw.chooseGroup),
    };
}

function normalizeDamageComponent(raw = {}, index = 0) {
    return {
        id: asText(raw.id, `damage-${index + 1}`),
        label: asText(raw.label, `Dano ${index + 1}`),
        formula: asText(raw.formula),
        fixed: asNumber(raw.fixed),
        attributeTerms: asArray(raw.attributeTerms).map(normalizeAttributeTerm),
        types: uniqueText(raw.types).map((type) => type.toLocaleLowerCase('pt-BR')),
        split: {
            group: asText(raw.split?.group),
            weight: Math.max(0, asNumber(raw.split?.weight, 1)),
            rounding: ['floor', 'ceil', 'round'].includes(raw.split?.rounding)
                ? raw.split.rounding
                : 'floor',
        },
        criticalPolicy: CRITICAL_POLICIES.includes(raw.criticalPolicy)
            ? raw.criticalPolicy
            : 'double',
        resistancePolicy: RESISTANCE_POLICIES.includes(raw.resistancePolicy)
            ? raw.resistancePolicy
            : 'normal',
        woundPolicy: WOUND_POLICIES.includes(raw.woundPolicy) ? raw.woundPolicy : 'by-type',
        appliesOn: ['hit', 'miss', 'save-success', 'save-failure', 'always'].includes(raw.appliesOn)
            ? raw.appliesOn
            : 'hit',
    };
}

function normalizeStatus(raw = {}, index = 0) {
    const input = typeof raw === 'string' ? { id: raw } : (raw ?? {});
    return {
        id: asText(input.id, `status-${index + 1}`).toLocaleLowerCase('pt-BR'),
        label: asText(input.label),
        target: ['self', 'target', 'area'].includes(input.target) ? input.target : 'target',
        stacks: Math.max(0, asInteger(input.stacks, 1)),
        maximumStacks:
            input.maximumStacks == null ? null : Math.max(0, asInteger(input.maximumStacks)),
        lifecycle: normalizeLifecycle(input.lifecycle, 'manual'),
        save: input.save
            ? {
                  attribute: asText(input.save.attribute).toUpperCase(),
                  dc: input.save.dc == null ? null : asNumber(input.save.dc),
                  timing: ['apply', 'turn-start', 'turn-end'].includes(input.save.timing)
                      ? input.save.timing
                      : 'apply',
                  onSuccess: asText(input.save.onSuccess, 'negate'),
              }
            : null,
        removal: uniqueText(input.removal),
    };
}

function normalizeEffect(raw = {}, index = 0) {
    return {
        id: asText(raw.id, `effect-${index + 1}`),
        kind: asText(raw.kind, 'modifier'),
        target: ['self', 'target', 'area'].includes(raw.target) ? raw.target : 'self',
        timing: asText(raw.timing, 'after-resolution'),
        data: raw.data && typeof raw.data === 'object' ? structuredClone(raw.data) : {},
        lifecycle: normalizeLifecycle(raw.lifecycle),
    };
}

export function normalizeTechniqueDefinition(raw = {}) {
    return {
        schemaVersion: TECHNIQUE_DEFINITION_VERSION,
        id: asText(raw.id),
        name: asText(raw.name, raw.id),
        sourceFamily: SOURCE_FAMILIES.includes(raw.sourceFamily)
            ? raw.sourceFamily
            : asText(raw.sourceFamily),
        sourceItemUuid: asText(raw.sourceItemUuid),
        ownerKind: OWNER_KINDS.includes(raw.ownerKind) ? raw.ownerKind : asText(raw.ownerKind),
        requirements: asArray(raw.requirements).map(normalizeRequirement),
        costs: {
            actions: asArray(raw.costs?.actions).map(normalizeActionCost),
            resources: asArray(raw.costs?.resources).map(normalizeResourceCost),
        },
        targeting: {
            mode: asText(raw.targeting?.mode, 'single'),
            count: Math.max(0, asInteger(raw.targeting?.count, 1)),
            range: raw.targeting?.range == null ? null : Math.max(0, asNumber(raw.targeting.range)),
            area:
                raw.targeting?.area && typeof raw.targeting.area === 'object'
                    ? structuredClone(raw.targeting.area)
                    : null,
            disposition: asText(raw.targeting?.disposition, 'enemy'),
            distinct: raw.targeting?.distinct === true,
        },
        attack:
            raw.attack === null || raw.attack === false
                ? null
                : {
                      attribute: asText(raw.attack?.attribute).toUpperCase(),
                      count: Math.max(1, asInteger(raw.attack?.count, 1)),
                      sequential: raw.attack?.sequential !== false,
                      bonus: asNumber(raw.attack?.bonus),
                      mode: asText(raw.attack?.mode, 'normal'),
                      critical: {
                          threshold: Math.min(
                              20,
                              Math.max(1, asInteger(raw.attack?.critical?.threshold, 20))
                          ),
                          disabled: raw.attack?.critical?.disabled === true,
                          source: asText(raw.attack?.critical?.source, 'definition'),
                      },
                  },
        defense:
            raw.defense === null || raw.defense === false
                ? null
                : {
                      allowed: uniqueText(raw.defense?.allowed),
                      attribute: asText(raw.defense?.attribute).toUpperCase(),
                      dc: raw.defense?.dc == null ? null : asNumber(raw.defense.dc),
                      onSuccess: asText(raw.defense?.onSuccess, 'negate'),
                      onFailure: asText(raw.defense?.onFailure, 'full'),
                  },
        damage: asArray(raw.damage).map(normalizeDamageComponent),
        statuses: asArray(raw.statuses).map(normalizeStatus),
        effects: asArray(raw.effects).map(normalizeEffect),
        lifecycle: normalizeLifecycle(raw.lifecycle),
        chat: {
            summary: asText(raw.chat?.summary, raw.name),
            details: asText(raw.chat?.details),
            showCosts: raw.chat?.showCosts !== false,
            showTargets: raw.chat?.showTargets !== false,
        },
        metadata:
            raw.metadata && typeof raw.metadata === 'object' ? structuredClone(raw.metadata) : {},
    };
}

export function validateTechniqueDefinition(raw = {}) {
    const definition = normalizeTechniqueDefinition(raw);
    const errors = [];
    const warnings = [];
    if (!definition.id) errors.push('id é obrigatório.');
    if (!SOURCE_FAMILIES.includes(definition.sourceFamily))
        errors.push(`sourceFamily inválido: ${definition.sourceFamily || 'vazio'}.`);
    if (!OWNER_KINDS.includes(definition.ownerKind))
        errors.push(`ownerKind inválido: ${definition.ownerKind || 'vazio'}.`);
    for (const action of definition.costs.actions)
        if (!action.type) errors.push(`Custo de ação ${action.id} não possui type.`);
    for (const resource of definition.costs.resources)
        if (!resource.resource) errors.push(`Custo de recurso ${resource.id} não possui resource.`);
    for (const component of definition.damage) {
        if (!component.formula && component.fixed === 0 && component.attributeTerms.length === 0)
            errors.push(`Parcela ${component.id} não possui fonte de dano.`);
        if (component.types.length === 0)
            warnings.push(`Parcela ${component.id} não possui tipo de dano.`);
    }
    for (const status of definition.statuses) {
        if (!status.id) errors.push('Status sem id.');
        if (
            status.lifecycle.scope !== 'instant' &&
            status.lifecycle.scope !== 'permanent' &&
            status.lifecycle.scope !== 'manual' &&
            status.lifecycle.duration == null
        ) {
            errors.push(
                `Status ${status.id} exige duration para lifecycle ${status.lifecycle.scope}.`
            );
        }
    }
    const splitGroups = Object.groupBy(
        definition.damage.filter((entry) => entry.split.group),
        (entry) => entry.split.group
    );
    for (const [group, entries] of Object.entries(splitGroups)) {
        if (entries.reduce((sum, entry) => sum + entry.split.weight, 0) <= 0)
            errors.push(`Grupo de divisão ${group} possui peso total zero.`);
    }
    if (definition.attack?.count > 1 && !definition.attack.sequential)
        warnings.push('Ataques múltiplos não sequenciais impedem cancelamento entre tentativas.');
    return { ok: errors.length === 0, definition, errors, warnings };
}

export function splitDamageTotal(total, components = []) {
    const amount = Math.max(0, asNumber(total));
    const normalized = asArray(components).map(normalizeDamageComponent);
    const weights = normalized.map((entry) => entry.split.weight);
    const sum = weights.reduce((current, weight) => current + weight, 0);
    if (!normalized.length || sum <= 0) return [];
    let assigned = 0;
    return normalized.map((entry, index) => {
        const raw = amount * (entry.split.weight / sum);
        const value =
            index === normalized.length - 1
                ? amount - assigned
                : entry.split.rounding === 'ceil'
                  ? Math.ceil(raw)
                  : entry.split.rounding === 'round'
                    ? Math.round(raw)
                    : Math.floor(raw);
        assigned += value;
        return { id: entry.id, types: entry.types, amount: value };
    });
}
