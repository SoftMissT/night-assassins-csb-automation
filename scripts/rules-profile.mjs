import vanilla from '../catalogs/rules-vanilla.json' with { type: 'json' };
import { actorKind } from './actor-kind.mjs';
import { MODULE_ID, STATUS_SLAYER } from './constants.mjs';
import { parseLevel } from './parsing.mjs';
import { SETTINGS } from './settings.mjs';

const SLOT = Object.freeze({
    metal: 'na_vanilla_metal',
    ability: 'na_vanilla_ability',
    origin: 'na_vanilla_origin',
    class: 'na_vanilla_class',
});
const LABEL = Object.freeze({
    metal: 'Metal da Nichirin',
    ability: 'Habilidade Especial',
    origin: 'Origem',
    class: 'Classe',
});
const GROUP_LABELS = Object.freeze({
    metal: 'Metal da Nichirin', habilidades: 'Habilidades especiais', origens: 'Origens', status: 'Status',
    classes: 'Classes', acoes: 'Ações', dano: 'Dano', vida_morte: 'Vida e Morte',
    respiracao: 'Respirações', progressao: 'Progressão',
});
const PROPERTY_LABELS = Object.freeze({
    nitoryu: 'Nitoryu', ryoto: 'Ryoto', morote: 'Morote', acuidade: 'Acuidade',
    concussao: 'Concussão', manejavel: 'Manejável', municiada: 'Municiada', precisao: 'Precisão',
});
const EXTRA_LABELS = Object.freeze({
    sonhos: 'Sonhos', raposa: 'Véus da Raposa', forja_viva: 'Forja Viva do Metal',
    corrente: 'Corrente do Vento', brasas: 'Brasas', veus: 'Véus', extras_pedra: 'Extras da Pedra',
    extras_nevoa: 'Extras da Névoa', extras_neve: 'Extras da Neve',
    troca_equivalente: 'Troca Equivalente', olhos_escarlate: 'Olhos Escarlates',
});
const vanillaStatus = new Set(vanilla.status);
const VARIANT_GROUPS = Object.freeze({
    metal: 'metal',
    ability: 'habilidades',
    habilidades: 'habilidades',
    origin: 'origens',
    origens: 'origens',
    status: 'status',
    class: 'classes',
    classes: 'classes',
    properties: 'propriedades',
    property: 'propriedades',
    propriedades: 'propriedades',
    action: 'acoes',
    acoes: 'acoes',
    damage: 'dano',
    dano: 'dano',
    lifeDeath: 'vida_morte',
    vida_morte: 'vida_morte',
    breathing: 'respiracao',
    respiracao: 'respiracao',
    progression: 'progressao',
    progressao: 'progressao',
});
const RULE_VARIANT_KEYS = Object.freeze([
    'metal', 'habilidades', 'origens', 'status', 'classes', 'acoes', 'dano', 'vida_morte',
    'respiracao', 'progressao',
]);
const PROPERTY_KEYS = Object.freeze([
    'nitoryu', 'ryoto', 'morote', 'acuidade', 'concussao', 'manejavel', 'municiada', 'precisao',
]);
const PROPERTY_ALIASES = Object.freeze(Object.fromEntries(PROPERTY_KEYS.map(key => [key, key])));
const HOME_BREW_EXTRAS = Object.freeze([
    'sonhos', 'raposa', 'forja_viva', 'corrente', 'brasas', 'veus', 'extras_pedra',
    'extras_nevoa', 'extras_neve', 'troca_equivalente', 'olhos_escarlate',
]);

function makeRuleSelection(profile = 'homebrew') {
    return {
        ...Object.fromEntries(RULE_VARIANT_KEYS.map(key => [key, profile])),
        propriedades: { ...Object.fromEntries(PROPERTY_KEYS.map(key => [key, profile])), sojutsu: false },
        ...Object.fromEntries(HOME_BREW_EXTRAS.map(key => [key, true])),
    };
}

function readSetting(key) {
    try { return globalThis.game?.settings?.get?.(MODULE_ID, key); }
    catch { return undefined; }
}

function storedRuleSelection() {
    const value = readSetting(SETTINGS.rulesSelection);
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
}

function legacyRuleSelection() {
    return makeRuleSelection(readSetting(SETTINGS.rulesProfile) === 'vanilla' ? 'vanilla' : 'homebrew');
}

function normalizeRuleSelection(value, base = makeRuleSelection()) {
    const result = structuredClone(base);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const key of RULE_VARIANT_KEYS) {
        if (value[key] === 'vanilla' || value[key] === 'homebrew') result[key] = value[key];
    }
    if (value.propriedades && typeof value.propriedades === 'object' && !Array.isArray(value.propriedades)) {
        for (const key of PROPERTY_KEYS) {
            if (value.propriedades[key] === 'vanilla' || value.propriedades[key] === 'homebrew')
                result.propriedades[key] = value.propriedades[key];
        }
        if (typeof value.propriedades.sojutsu === 'boolean') result.propriedades.sojutsu = value.propriedades.sojutsu;
    }
    for (const key of HOME_BREW_EXTRAS) {
        if (typeof value[key] === 'boolean') result[key] = value[key];
    }
    return result;
}

function isValidRuleSelection(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const known = new Set([...RULE_VARIANT_KEYS, 'propriedades', ...HOME_BREW_EXTRAS]);
    if (Object.keys(value).some(key => !known.has(key))) return false;
    if (RULE_VARIANT_KEYS.some(key => key in value && !['vanilla', 'homebrew'].includes(value[key]))) return false;
    if (value.propriedades !== undefined) {
        if (!value.propriedades || typeof value.propriedades !== 'object' || Array.isArray(value.propriedades)) return false;
        const propertyKeys = new Set([...PROPERTY_KEYS, 'sojutsu']);
        if (Object.keys(value.propriedades).some(key => !propertyKeys.has(key))) return false;
        if (PROPERTY_KEYS.some(key => key in value.propriedades && !['vanilla', 'homebrew'].includes(value.propriedades[key]))) return false;
        if ('sojutsu' in value.propriedades && typeof value.propriedades.sojutsu !== 'boolean') return false;
    }
    return HOME_BREW_EXTRAS.every(key => !(key in value) || typeof value[key] === 'boolean');
}

function resolveRuleSelection() {
    const stored = storedRuleSelection();
    return normalizeRuleSelection(stored ?? legacyRuleSelection());
}

/** Returns the complete rulesSelection object, one group, or one weapon-property variant. */
export function getRuleSelection(group) {
    const selection = resolveRuleSelection();
    if (group === undefined) return selection;
    if (group === 'sojutsu') return selection.propriedades.sojutsu;
    if (Object.hasOwn(PROPERTY_ALIASES, group)) return selection.propriedades[PROPERTY_ALIASES[group]];
    const key = VARIANT_GROUPS[group];
    return key ? selection[key] : Object.hasOwn(selection, group) ? selection[group] : undefined;
}

/** Returns the active variant for a rules group or a selected weapon property. */
export function ruleVariant(group) {
    if (group === 'propriedades' || group === 'properties' || group === 'property') return null;
    const selected = getRuleSelection(group);
    return selected === 'vanilla' || selected === 'homebrew' ? selected : null;
}

export function isHomebrewExtra(key) {
    if (key === 'sojutsu') return getRuleSelection('propriedades').sojutsu;
    return HOME_BREW_EXTRAS.includes(key) && getRuleSelection(key) === true;
}

/** Persists the first-world migration after settings are available (call from ready). */
export async function migrateRulesSelection() {
    if (!globalThis.game?.settings?.set) return { migrated: false, reason: 'settings-unavailable' };
    const stored = storedRuleSelection();
    if (stored) return { migrated: false, selection: normalizeRuleSelection(stored) };
    const selection = legacyRuleSelection();
    await globalThis.game.settings.set(MODULE_ID, SETTINGS.rulesSelection, JSON.stringify(selection));
    return { migrated: true, selection };
}

export async function saveRulesSelection(value) {
    if (!globalThis.game?.user?.isGM) return { ok: false, reason: 'gm-required' };
    if (!isValidRuleSelection(value)) return { ok: false, reason: 'invalid-selection' };
    const selection = normalizeRuleSelection(value, resolveRuleSelection());
    await globalThis.game.settings.set(MODULE_ID, SETTINGS.rulesSelection, JSON.stringify(selection));
    return { ok: true, selection };
}

export function getRulesProfile() {
    const selection = resolveRuleSelection();
    return [...RULE_VARIANT_KEYS, ...PROPERTY_KEYS].every(key =>
        (PROPERTY_KEYS.includes(key) ? selection.propriedades[key] : selection[key]) === 'vanilla')
        ? 'vanilla' : 'homebrew';
}

export function sheetRuleFlags() {
    return {
        ...Object.fromEntries(RULE_VARIANT_KEYS.map(group => [
            `na_regras_${group}`, Number(ruleVariant(group) === 'vanilla'),
        ])),
        ...Object.fromEntries(PROPERTY_KEYS.map(property => [
            `na_regras_propriedades_${property}`,
            Number(ruleVariant(property) === 'vanilla'),
        ])),
        na_rules_vanilla: Number(getRulesProfile() === 'vanilla'),
    };
}

export function preserveVanillaSelectionsOnTemplateReload(actor, changes) {
    const next = changes.system;
    if (!Array.isArray(next?.hidden) || !next.props) return;
    const previousHidden = new Set(actor.system.hidden?.map(field => field.name));
    const nextHidden = new Set(next.hidden.map(field => field.name));
    const migrating = Object.values(SLOT).filter(key => previousHidden.has(key) && !nextHidden.has(key));
    if (!migrating.length) return;
    // CSB 6.1 reloads with prepared props, where legacy formulas replace the saved selections.
    const saved = actor.toObject().system.props;
    for (const key of migrating) {
        if (Object.hasOwn(next.props, key) && Object.hasOwn(saved, key)) next.props[key] = saved[key];
    }
}

export function vanillaRuleCatalog(category, kind = 'slayer') {
    if (!Object.hasOwn(SLOT, category)) return {};
    if (category === 'origin') return vanilla[kind === 'oni' ? 'oniOrigin' : 'slayerOrigin'];
    if (category === 'class') return vanilla[kind === 'oni' ? 'oniClass' : 'slayerClass'];
    return vanilla[category];
}

export function vanillaRuleSelection(props = {}, category, kind = actorKind({ system: { props } })) {
    const catalog = vanillaRuleCatalog(category, kind);
    const key = String(props[SLOT[category]] ?? '');
    if (!Object.hasOwn(catalog, key)) return null;
    const entry = catalog[key];
    if (entry.requiredOrigin && props[SLOT.origin] !== entry.requiredOrigin) return null;
    return { key, ...entry };
}

export function effectiveRulesAbility(props = {}, profile = ruleVariant('habilidades')) {
    return profile === 'vanilla' ? vanillaRuleSelection(props, 'ability')?.key ?? '' : props.hab_escolhida ?? '';
}

export function vanillaClassRank(rawLevel, kind = 'slayer') {
    const level = parseLevel(rawLevel);
    const levels = kind === 'oni' ? vanilla.oniClassRankLevels : vanilla.slayerClassRankLevels;
    return Object.keys(levels).findLast(rank => level >= levels[rank]) ?? null;
}

export function ruleStatusCatalog({ profile = ruleVariant('status'), active = [] } = {}) {
    if (profile !== 'vanilla') return STATUS_SLAYER;
    const activeKeys = new Set(active);
    return STATUS_SLAYER.filter(status => vanillaStatus.has(status.key) || activeKeys.has(status.key));
}

export function isRulesStatusSelectable(key, profile = ruleVariant('status')) {
    return profile !== 'vanilla' || vanillaStatus.has(key);
}

/**
 * Contextual effects require the caller to confirm the roll's purpose. Results
 * use the normal derived-bonus source shape for auditing and chat attribution.
 */
export function vanillaDerivedBonuses(props = {}, context = {}) {
    const variant = (group) => context.ruleVariants?.[group] ?? context.rulesProfile ?? 'vanilla';
    const selectedMetal = variant('metal') === 'vanilla' ? vanillaRuleSelection(props, 'metal') : null;
    const metal = selectedMetal?.requiredOrigin && variant('origens') !== 'vanilla' ? null : selectedMetal;
    const ability = variant('habilidades') === 'vanilla' ? vanillaRuleSelection(props, 'ability') : null;
    const origin = variant('origens') === 'vanilla' ? vanillaRuleSelection(props, 'origin') : null;
    const level = Math.max(0, parseLevel(props.npc_nivel ?? props.nvl_num ?? props.nvl_pj));
    const sources = [];
    const add = (rule, channel, value, originLabel) => {
        if (value) sources.push({ channel, value, label: rule.label, origin: originLabel });
    };
    if (metal) {
        if (context.isTechnique && context.isAttack && context.dealsDamage)
            add(metal, 'acerto', metal.attackTechniqueDamage, 'Metal');
        if (context.isTechnique && context.isAttack && context.appliesCondition && context.dealsDamage === false)
            add(metal, 'acerto', metal.attackTechniqueCondition, 'Metal');
        if (context.defenseAgainstAttack)
            add(metal, 'bloqueio', metal.block, 'Metal');
        if (context.isTechnique && (context.actionType === 'reacao' || context.protectsSomeone) && context.channel)
            add(metal, context.channel, metal.reactionOrProtection, 'Metal');
        add(metal, 'pdrMaximo', metal.pdrMaximum, 'Metal');
    }
    if (ability) {
        if (context.isAttack) add(ability, 'acerto', ability.attack, 'Habilidade Especial');
        if (context.testAttribute === 'CAR') add(ability, 'teste', ability.carTest, 'Habilidade Especial');
        if (context.smellPerception) add(ability, 'teste', ability.smell, 'Habilidade Especial');
        if (context.surpriseDefense && ['bloqueio', 'esquiva'].includes(context.channel))
            add(ability, context.channel, ability.surpriseDefense, 'Habilidade Especial');
        add(ability, 'pdrMaximo', (ability.pdrPerLevel ?? 0) * level, 'Habilidade Especial');
    }
    if (origin && level >= origin.initiativeLevel && context.enemyCount > 1)
        add(origin, 'iniciativa', origin.initiativeMultipleEnemies, 'Origem');
    return sources;
}

export function buildVanillaSelectionPatch(selections = {}, kind = 'slayer') {
    const patch = {};
    for (const [category, property] of Object.entries(SLOT)) {
        if (!Object.hasOwn(selections, category)) continue;
        const key = String(selections[category] ?? '');
        const catalog = vanillaRuleCatalog(category, kind);
        if ((kind === 'oni' && category === 'ability' && key) || (key && !Object.hasOwn(catalog, key)))
            return { ok: false, reason: `Opção inválida para ${LABEL[category]}.` };
        patch[`system.props.${property}`] = key;
    }
    const metal = vanilla.metal[selections.metal];
    if (metal?.requiredOrigin && Object.hasOwn(selections, 'origin') && selections.origin !== metal.requiredOrigin)
        return { ok: false, reason: 'Metal Preto exige a origem Descendente na variante Vanilla.' };
    return { ok: true, patch };
}

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export async function openRulesTableManager({ actor, actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM) return ui.notifications?.warn?.('Regras da Mesa é exclusivo do GM.');
    if (!actor && actorUuid) {
        const document = await fromUuid(actorUuid);
        actor = document?.actor ?? document;
    }
    const kind = actorKind(actor);
    const canEditActor = Boolean(actor?.update && (actor.isOwner || globalThis.game?.user?.isGM)
        && ['npc', 'slayer', 'oni'].includes(kind));
    const selection = getRuleSelection();
    const variant = (name, label, selected) => `
        <fieldset class="na-table-rule">
            <legend>${label}</legend>
            <span class="na-table-rule-label" aria-hidden="true">${label}</span>
            <div class="na-table-rule-options">
                <label><input type="radio" name="${name}" value="vanilla"${selected === 'vanilla' ? ' checked' : ''}><span>Vanilla</span></label>
                <label><input type="radio" name="${name}" value="homebrew"${selected === 'homebrew' ? ' checked' : ''}><span>Homebrew</span></label>
            </div>
        </fieldset>`;
    const groups = RULE_VARIANT_KEYS.map(key => variant(`rule_${key}`, GROUP_LABELS[key], selection[key])).join('');
    const properties = PROPERTY_KEYS.map(key => variant(`property_${key}`, PROPERTY_LABELS[key], selection.propriedades[key])).join('');
    const extras = HOME_BREW_EXTRAS.map(key => `<label><input type="checkbox" name="extra_${key}"${selection[key] ? ' checked' : ''}> ${EXTRA_LABELS[key] ?? key}</label>`).join('');
    const classRules = canEditActor
        ? `<details><summary>Regras das classes Vanilla</summary>${Object.values(vanillaRuleCatalog('class', kind)).map(entry => `<p><strong>${escapeHtml(entry.label)}</strong> · p. ${escapeHtml(entry.page)}<br>${escapeHtml(entry.effect)}</p>`).join('')}</details>`
        : '';
    const actorCategories = canEditActor ? Object.keys(SLOT).filter(key => kind !== 'oni' || key !== 'ability') : [];
    const actorSelections = canEditActor ? `<details><summary>Escolhas Vanilla de ${escapeHtml(actor.name)}</summary><div class="na-table-rules-fields">${actorCategories.map(category => {
        const choices = Object.entries(vanillaRuleCatalog(category, kind));
        const selected = actor.system?.props?.[SLOT[category]] ?? '';
        return `<label>${LABEL[category]} <select name="actor_${category}"><option value="">Nenhum</option>${choices.map(([key, entry]) => `<option value="${escapeHtml(key)}"${selected === key ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}</select></label>`;
    }).join('')}</div>${classRules}</details>` : '';
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Regras da Mesa' },
        classes: ['na-table-rules-window'],
        position: { width: 550 },
        content: `<div class="na-table-rules">
            <header>
                <h3>Variantes do mundo</h3>
                <p>As mudanças valem para todos os jogadores após recarregar o mundo.</p>
            </header>
            <section aria-label="Variantes do mundo">
                ${groups}
            </section>
            <details><summary>Propriedades de arma</summary>
                ${properties}
                <div class="na-table-rules-fields"><label><input type="checkbox" name="property_sojutsu"${selection.propriedades.sojutsu ? ' checked' : ''}> Sōjutsu (extra Homebrew)</label></div>
            </details>
            <details><summary>Extras da mesa</summary><div class="na-table-rules-fields">${extras}</div></details>
            ${actorSelections}
        </div>`,
        buttons: [
            { action: 'save', label: 'Salvar', default: true, callback: (_event, button) => {
                const form = button.form;
                return {
                    selection: {
                        ...Object.fromEntries(RULE_VARIANT_KEYS.map(key => [key, form.elements[`rule_${key}`]?.value ?? selection[key]])),
                        propriedades: {
                            ...Object.fromEntries(PROPERTY_KEYS.map(key => [key, form.elements[`property_${key}`]?.value ?? selection.propriedades[key]])),
                            sojutsu: Boolean(form.elements.property_sojutsu?.checked),
                        },
                        ...Object.fromEntries(HOME_BREW_EXTRAS.map(key => [key, Boolean(form.elements[`extra_${key}`]?.checked)])),
                    },
                    actor: Object.fromEntries(actorCategories.map(key => [key, form.elements[`actor_${key}`]?.value ?? ''])),
                };
            } },
            { action: 'close', label: 'Fechar', callback: () => false },
        ],
        rejectClose: false,
    });
    if (!result || typeof result !== 'object') return null;
    if (!globalThis.game?.user?.isGM) return null;
    const actorPatch = {};
    if (canEditActor) {
        const activeVanilla = actorCategories.filter(key => result.selection[
            ({ metal: 'metal', ability: 'habilidades', origin: 'origens', class: 'classes' })[key]
        ] === 'vanilla');
        const actorChoices = Object.fromEntries(activeVanilla.map(key => [key, result.actor[key]]));
        const plan = buildVanillaSelectionPatch(actorChoices, kind);
        if (!plan.ok) return ui.notifications?.warn?.(plan.reason);
        Object.assign(actorPatch, plan.patch);
    }
    const saved = await saveRulesSelection(result.selection);
    if (!saved.ok) return ui.notifications?.warn?.('Não foi possível salvar as regras da mesa.');
    if (Object.keys(actorPatch).length) await actor.update(actorPatch, { naCsbAutomation: true, naRulesProfile: true });
    ui.notifications?.info?.('Regras da Mesa salvas. Recarregue o mundo para aplicar as mudanças.');
    return saved;
}

export async function openRulesProfileManager({ actor, actorUuid } = {}) {
    if (!actor && actorUuid) {
        const document = await fromUuid(actorUuid);
        actor = document?.actor ?? document;
    }
    actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? globalThis.game?.user?.character;
    const kind = actorKind(actor);
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM) || !['npc', 'slayer', 'oni'].includes(kind))
        return ui.notifications?.warn?.('Escolha uma ficha que você possa controlar.');
    const categories = Object.keys(SLOT).filter(key => (kind !== 'oni' || key !== 'ability')
        && ruleVariant(key) === 'vanilla');
    if (!categories.length)
        return ui.notifications?.info?.('As escolhas desta ficha estão em Homebrew.');
    const props = actor.system?.props ?? {};
    const selectHtml = categories.map(category => {
        const choices = Object.entries(vanillaRuleCatalog(category, kind));
        return `<label>${LABEL[category]} <select name="${category}"><option value="">Nenhum</option>${choices
            .map(([key, entry]) => `<option value="${escapeHtml(key)}"${props[SLOT[category]] === key ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}</select></label>`;
    }).join('');
    const definitions = categories.map(category => {
        const choices = Object.values(vanillaRuleCatalog(category, kind));
        return `<details><summary>${LABEL[category]} · regras</summary>${choices.map(entry =>
            `<p><strong>${escapeHtml(entry.label)}.</strong> ${escapeHtml(entry.effect)} <small>${entry.source === 'supplement' ? 'Beginning Hour' : 'Livro base'} · p. ${entry.page}</small></p>`).join('')}</details>`;
    }).join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Escolhas Vanilla' },
        classes: ['na-table-rules-window'],
        position: { width: 550 },
        content: `<div class="na-table-rules"><div class="na-table-rules-fields">${selectHtml}</div>${definitions}</div>`,
        buttons: [
            { action: 'save', label: 'Salvar', default: true, callback: (_event, button) =>
                Object.fromEntries(categories.map(key => [key, button.form.elements[key]?.value ?? ''])) },
            { action: 'close', label: 'Fechar', callback: () => false },
        ],
        rejectClose: false,
    });
    if (!result || typeof result !== 'object') return null;
    if (!actor.isOwner && !globalThis.game?.user?.isGM) return null;
    const active = categories.filter(key => ruleVariant(key) === 'vanilla');
    if (!active.length) return null;
    const choices = Object.fromEntries(active.map(key => [key, result[key]]));
    const plan = buildVanillaSelectionPatch(choices, kind);
    if (!plan.ok) return ui.notifications?.warn?.(plan.reason);
    await actor.update(plan.patch, { naCsbAutomation: true, naRulesProfile: true });
    return plan;
}
