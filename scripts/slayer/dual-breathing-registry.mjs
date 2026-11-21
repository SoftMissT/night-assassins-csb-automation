import { actorKind } from '../actor-kind.mjs';
import { chosenBreathing } from '../breathing-choice.mjs';
import { canonicalBreathing, resolveForm } from '../breathing-contract.mjs';
import { MODULE_ID } from '../constants.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { SETTINGS } from '../settings.mjs';
import { classRankAtLevel, selectedSlayerClassKey } from './class-contracts.mjs';
import { dualBreathingRankPlan, dualBreathingSecondaryPlan } from './class-runtime.mjs';
import { secondaryBreathingForActor } from './dual-breathing-service.mjs';

const CLASS_KEY = 'classe_usuario_de_duas_resp';
const KINDS = { minor: 'Variação Menor', derived: 'Técnica Derivada' };
const TRAITS = {
    element: 'Elemento', form: 'Forma', movement: 'Movimento',
    condition: 'Condição', defense: 'Defesa', rhythm: 'Ritmo',
};
const TEXT_FIELDS = {
    name: 'Nome', action: 'Ação prevista', target: 'Alvo ou área',
    effect: 'Efeito manual', limitation: 'Limitação', description: 'Descrição',
};
let approvalPending = false;
const fail = reason => ({ ok: false, reason });
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function registryContext(actor) {
    const props = actor?.system?.props;
    if (ruleVariant('classes') !== 'homebrew' ||
        !['slayer', 'npc'].includes(actorKind(actor)) ||
        selectedSlayerClassKey(props, 'homebrew') !== CLASS_KEY) {
        return fail('O cadastro exige a classe Usuário de Duas Respirações no perfil Homebrew.');
    }
    const level = props.nvl_num ?? props.npc_nivel ?? props.nvl_pj;
    const rank = classRankAtLevel(level, 'homebrew');
    if (!rank) return fail('Rank C exigido para cadastrar Variações.');
    const primary = chosenBreathing(props);
    const secondary = secondaryBreathingForActor(actor);
    if (!primary || !secondary) return fail('Escolha duas Respirações diferentes na ficha.');
    const compatibility = props.slayer_class_duas_resp_compatibility;
    if (!['compatible', 'incompatible'].includes(compatibility))
        return fail('Defina a compatibilidade do par na ficha.');

    const secondaryLevel = dualBreathingSecondaryPlan(level, compatibility === 'compatible', 'homebrew').level;
    const forms = new Map();
    for (const item of actor.items ?? []) {
        const itemProps = item.system?.props ?? {};
        const formId = itemProps.forma_id;
        const breathing = canonicalBreathing(itemProps.respiracao_nome);
        if (!item.id || typeof formId !== 'string' || formId.startsWith('hub_') ||
            (breathing !== primary && breathing !== secondary)) continue;
        const official = resolveForm(breathing, formId);
        const custom = formId.startsWith('custom_') && itemProps.inventario_categoria === 'respiracao';
        if ((!official && !custom) || official?.passiva || itemProps.tipo_manobra === 'passiva') continue;
        if (breathing === secondary) {
            const minimum = Math.max(1, parseNumber(itemProps.nivel_req));
            if (minimum > secondaryLevel) continue;
            const hasLevel = [1, 2, 3, 4].some(level => {
                if (level < minimum || level > secondaryLevel) return false;
                if (official) return Boolean(official.niveis[level - 1]);
                const raw = itemProps[`tem_nvl${level}`];
                const enabled = raw?.value ?? raw?.current ?? raw?.raw ?? raw;
                return enabled === true || enabled === 'true' || parseNumber(enabled) === 1;
            });
            if (!hasLevel) continue;
        }
        forms.set(item.id, { item, breathing, formId });
    }
    return {
        ok: true, rank, forms, primary, secondary, secondaryLevel, compatibility,
        limits: {
            minor: dualBreathingRankPlan(rank === 'C' ? 'C' : 'B', 'homebrew').minorVariations,
            derived: ['A', 'S', 'SS'].includes(rank) ? dualBreathingRankPlan('A', 'homebrew').derivedTechniques : 0,
        },
    };
}

function storedRegistry() {
    return globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.dualBreathingVariations) ?? {};
}

function storedVariations(actor, registry) {
    const records = Object.hasOwn(registry, actor.uuid) ? registry[actor.uuid] : null;
    return Array.isArray(records) ? records : [];
}

function validateDraft(context, draft) {
    if (!Object.hasOwn(KINDS, draft?.kind ?? '') || !context.limits[draft.kind])
        return fail('Esta categoria de técnica ainda não foi liberada pelo Rank.');
    const base = context.forms.get(draft.baseItemId);
    const influence = context.forms.get(draft.influenceItemId);
    if (!base || !influence || base.breathing === influence.breathing)
        return fail('Escolha uma Forma disponível de cada Respiração para base e influência.');
    const maximum = draft.kind === 'minor' ? 1 : dualBreathingRankPlan('A', 'homebrew').changesUpToTraits;
    const traits = Array.isArray(draft.traits) ? [...new Set(draft.traits)] : [];
    if (traits.length !== draft.traits?.length || !traits.length || traits.length > maximum ||
        traits.some(trait => !Object.hasOwn(TRAITS, trait) || (draft.kind === 'minor' && trait === 'defense')))
        return fail('Selecione os traços permitidos para esta categoria.');
    const extraPdr = Number(draft.extraPdr ?? 0);
    if (!['string', 'number'].includes(typeof (draft.extraPdr ?? 0)) ||
        !Number.isSafeInteger(extraPdr) || extraPdr < 0)
        return fail('O custo adicional deve ser um número inteiro de PDR igual ou maior que zero.');

    const metadata = {};
    for (const [field, label] of Object.entries(TEXT_FIELDS)) {
        const value = typeof draft[field] === 'string' ? draft[field].trim() : '';
        if (!value || value.length > (field === 'name' ? 100 : 1000))
            return fail(`Preencha o campo ${label} dentro do limite de caracteres.`);
        metadata[field] = value;
    }
    return {
        ok: true,
        record: {
            ...metadata, kind: draft.kind, traits, extraPdr, manual: true,
            baseItemId: base.item.id, baseBreathing: base.breathing, baseFormId: base.formId,
            influenceItemId: influence.item.id, influenceBreathing: influence.breathing, influenceFormId: influence.formId,
        },
    };
}

export function dualBreathingVariations(actor) {
    const context = registryContext(actor);
    if (!context.ok) return [];
    const counts = { minor: 0, derived: 0 };
    const records = [];
    for (const stored of storedVariations(actor, storedRegistry())) {
        const { record } = validateDraft(context, stored);
        if (!record || typeof stored.id !== 'string' || !stored.id ||
            records.some(entry => entry.id === stored.id) || counts[record.kind] >= context.limits[record.kind] ||
            stored.baseBreathing !== record.baseBreathing || stored.baseFormId !== record.baseFormId ||
            stored.influenceBreathing !== record.influenceBreathing || stored.influenceFormId !== record.influenceFormId) continue;
        counts[record.kind] += 1;
        records.push({ id: stored.id, ...record });
    }
    return records;
}

export function dualBreathingCompositeCatalog(actor, primaryLevel) {
    const context = registryContext(actor);
    if (!context.ok || context.rank !== 'SS') return null;
    const sources = [];
    for (const { item, breathing, formId } of context.forms.values()) {
        const side = breathing === context.primary ? 'primary' : 'secondary';
        const limit = side === 'primary' ? primaryLevel : context.secondaryLevel;
        const itemProps = item.system.props;
        const official = resolveForm(breathing, formId);
        for (let level = Math.max(1, parseNumber(itemProps.nivel_req)); level <= Math.min(4, limit); level++) {
            const data = official?.niveis[level - 1];
            const custom = formId.startsWith('custom_') && Number(itemProps[`tem_nvl${level}`]) === 1;
            if (!data && !custom) continue;
            const pdrCost = data ? data.custo : Number(itemProps[`nvl${level}_custo`]);
            if (!Number.isSafeInteger(pdrCost) || pdrCost < 0) continue;
            sources.push({ key: `${item.id}:${level}`, itemId: item.id, side, level, formId, breathing, pdrCost, label: item.name });
        }
    }
    return { ...context, sources, record: storedVariations(actor, storedRegistry()).find(entry => entry.kind === 'composite') ?? null };
}

const MIXES = new Set(['form', 'movement', 'condition', 'defense', 'conditional-execution']);
const PRICES = new Set(['once-per-combat', 'internal-damage', 'end-posture', 'lock-secondary', 'full-action',
    'target-condition', 'next-defense-disadvantage', 'exhaustion-on-fail']);

export async function approveDualBreathingComposite(actor, draft, primaryLevel) {
    if (!globalThis.game?.user?.isGM) return fail('Apenas o GM pode aprovar a Forma Composta.');
    if (approvalPending) return fail('Já existe uma aprovação em andamento.');
    const catalog = dualBreathingCompositeCatalog(actor, primaryLevel);
    const primary = catalog?.sources.find(source => source.side === 'primary' && source.key === draft?.primary);
    const secondary = catalog?.sources.find(source => source.side === 'secondary' && source.key === draft?.secondary);
    if (!actor?.uuid || !primary || !secondary || !MIXES.has(draft.mixType) || !PRICES.has(draft.price))
        return fail('Escolha duas técnicas disponíveis, uma mistura e um preço.');
    const fields = ['name', 'target', 'effect', 'description'].map(field => String(draft[field] ?? '').trim());
    const [name, target, effect, description] = fields;
    const condition = String(draft.condition ?? '').trim();
    if (fields.some(value => !value || value.length > 1000) || name.length > 100 ||
        (draft.price === 'target-condition' && !condition))
        return fail('Preencha nome, alvo, efeito, descrição e a condição exigida pelo preço.');
    const record = {
        kind: 'composite', name, target, effect, description, mixType: draft.mixType,
        price: { type: draft.price, condition },
        primary: { key: primary.key, formId: primary.formId, breathing: primary.breathing },
        secondary: { key: secondary.key, formId: secondary.formId, breathing: secondary.breathing },
    };
    const registry = storedRegistry();
    approvalPending = true;
    try {
        await game.settings.set(MODULE_ID, SETTINGS.dualBreathingVariations, {
            ...registry,
            [actor.uuid]: [...storedVariations(actor, registry).filter(entry => entry.kind !== 'composite'), record],
        });
        return { ok: true, record };
    } finally {
        approvalPending = false;
    }
}

export async function registerDualBreathingVariation(actor, draft) {
    if (!globalThis.game?.user?.isGM) return fail('Apenas o GM pode aprovar Variações.');
    if (approvalPending) return fail('Já existe uma aprovação em andamento.');
    const context = registryContext(actor);
    if (!context.ok) return context;
    if (!actor.uuid) return fail('O personagem precisa estar salvo no mundo.');
    const validation = validateDraft(context, draft);
    if (!validation.ok) return validation;
    const { record } = validation;
    const registry = storedRegistry();
    const records = storedVariations(actor, registry);
    if (records.filter(entry => entry?.kind === record.kind).length >= context.limits[record.kind])
        return fail(`Limite de registros de ${KINDS[record.kind]} atingido neste Rank.`);
    const approved = { id: globalThis.foundry.utils.randomID(), ...record };
    approvalPending = true;
    try {
        await globalThis.game.settings.set(MODULE_ID, SETTINGS.dualBreathingVariations, {
            ...registry, [actor.uuid]: [...records, approved],
        });
        return { ok: true, record: approved };
    } finally {
        approvalPending = false;
    }
}

export async function openDualBreathingRegistry(actor) {
    if (!globalThis.game?.user?.isGM) return fail('Apenas o GM pode aprovar Variações.');
    const warn = result => {
        globalThis.ui.notifications.warn(result.reason);
        return result;
    };
    const context = registryContext(actor);
    if (!context.ok) return warn(context);
    const forms = [...context.forms.values()];
    if (new Set(forms.map(form => form.breathing)).size < 2)
        return warn(fail('O personagem precisa ter uma Forma disponível de cada Respiração.'));
    const options = (entries, placeholder = 'Escolha') =>
        `<option value="">${placeholder}</option>` + entries.map(([value, label]) =>
            `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    const formOptions = options(forms.map(({ item, breathing }) => [item.id, `${breathing} · ${item.name}`]));
    const kindOptions = options(Object.entries(KINDS).filter(([kind]) => context.limits[kind]));
    const traitOptions = options(Object.entries(TRAITS), 'Nenhum');
    const draft = await globalThis.foundry.applications.api.DialogV2.wait({
        window: { title: 'Aprovar Variação ou Técnica Derivada' },
        modal: true,
        rejectClose: false,
        content: `<p>A Forma-base fornece as regras automatizadas. Registre as mudanças de estrutura e as limitações para aplicação manual.</p>
            <label>Categoria <select name="kind" required>${kindOptions}</select></label>
            <label>Forma-base <select name="baseItemId" required>${formOptions}</select></label>
            <label>Forma de influência <select name="influenceItemId" required>${formOptions}</select></label>
            <label>Primeiro traço <select name="trait1" required>${traitOptions}</select></label>
            ${context.limits.derived ? `<label>Segundo traço (Derivada) <select name="trait2">${traitOptions}</select></label>` : ''}
            <label>PDR da limitação <input type="number" name="extraPdr" min="0" step="1" value="0" required></label>
            ${Object.entries(TEXT_FIELDS).map(([field, label]) =>
                `<label>${label} <input name="${field}" maxlength="${field === 'name' ? 100 : 1000}" required></label>`).join('')}`,
        buttons: [
            {
                action: 'approve', label: 'Aprovar',
                callback: (_event, button) => {
                    const fields = button.form.elements;
                    return {
                        ...Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, fields[key].value])),
                        kind: fields.kind.value, baseItemId: fields.baseItemId.value,
                        influenceItemId: fields.influenceItemId.value, extraPdr: fields.extraPdr.value,
                        traits: [fields.trait1.value, fields.trait2?.value].filter(Boolean),
                    };
                },
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!draft) return null;
    const result = await registerDualBreathingVariation(actor, draft);
    if (!result.ok) return warn(result);
    globalThis.ui.notifications.info(`${KINDS[result.record.kind]} aprovada.`);
    return result;
}
