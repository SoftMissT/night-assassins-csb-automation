/**
 * @fileoverview Runtime universal de Armas Especiais.
 *
 * v0.11.59: primeiro slice funcional da Yamato.
 * - hidrata dados estáticos a partir do Compendium oficial sem depender de IDs de World;
 * - abre o painel de habilidades;
 * - arma Veredito Entre Cortes e Oito Gargantas para o próximo ataque;
 * - executa Corte do Julgamento (Rank B+);
 * - expõe o pending para hit-service/damage-service sem duplicar o pipeline normal.
 */

import { MODULE_ID } from './constants.mjs';
import { consumeSlayerActions } from './action-service.mjs';
import { applyStackingBreathingStatus } from './breath-service.mjs';
import { slayerWeaponRank, weaponProfilesForActor } from './weapon-service.mjs';

export const SPECIAL_WEAPON_PENDING_FLAG = 'specialWeaponPending';
export const YAMATO_NAME = "Yamato The Rift-Walker's Legacy";
const SPECIAL_WEAPON_PACK = `${MODULE_ID}.night-assassins-armas-slayer`;

function normalizeText(value = '') {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '');
}

function structured(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function emptyRuntimeValue(value) {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    const text = value.trim();
    return text === '' || text === '{}' || text === '[]';
}

function combatStamp() {
    return {
        combatId: game.combat?.id ?? null,
        round: game.combat?.round ?? null,
        turn: game.combat?.turn ?? null,
    };
}

function pendingIsCurrent(pending) {
    if (!pending || typeof pending !== 'object') return false;
    if (pending.combatId === null || pending.combatId === undefined) return true;
    return (
        pending.combatId === (game.combat?.id ?? null) &&
        pending.round === (game.combat?.round ?? null) &&
        pending.turn === (game.combat?.turn ?? null)
    );
}

async function resolveSpecialItem(options = {}) {
    if (options.item && options.item.documentName !== 'Actor') return options.item;
    if (options.itemUuid) {
        const doc = await fromUuid(options.itemUuid);
        if (doc && doc.documentName !== 'Actor') return doc;
    }
    return null;
}

async function resolveBearer(item, options = {}) {
    if (item?.parent?.documentName === 'Actor') return item.parent;
    if (options.actor?.documentName === 'Actor') return options.actor;
    if (options.actorUuid) {
        const doc = await fromUuid(options.actorUuid);
        const actor = doc?.actor ?? doc;
        if (actor?.documentName === 'Actor') return actor;
    }
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

async function canonicalSpecialWeapon(item) {
    const name = String(item?.system?.props?.arma_nome ?? item?.name ?? '').trim();
    if (!name) return null;
    const pack =
        game.packs?.get?.(SPECIAL_WEAPON_PACK) ??
        [...(game.packs ?? [])].find(
            (entry) =>
                entry.metadata?.packageName === MODULE_ID &&
                entry.metadata?.name === 'night-assassins-armas-slayer'
        );
    if (!pack) return null;
    const index = await pack.getIndex({ fields: ['name'] });
    const hit = index.find((entry) => entry.name === name);
    return hit ? pack.getDocument(hit._id) : null;
}

export async function hydrateSpecialWeaponItem(item) {
    if (!item) return { ok: false, reason: 'Item inválido.' };
    if (item.pack) return { ok: true, canonical: item, patch: {} };
    if (!item.update) return { ok: false, reason: 'Item inválido.' };
    const canonical = await canonicalSpecialWeapon(item);
    if (!canonical) return { ok: false, reason: 'Arma não encontrada no Compendium oficial.' };

    const local = item.system?.props ?? {};
    const source = canonical.system?.props ?? {};
    const copyIfEmpty = [
        'arma_entidade',
        'arma_demonio',
        'arma_lado_dominante',
        'arma_gatilho_despertar',
        'arma_reacao_entidade',
        'arma_especial_forma_atual',
        'arma_habilidade_resumo',
        'arma_especial_estados_json',
        'arma_especial_habilidades_json',
        'arma_especial_rank_effects_json',
        'arma_especial_integracao_json',
        'dupla_alma_vinculo_json',
        'dupla_alma_cerimonia_json',
        'dupla_alma_despertar_json',
        'arma_marcas_demonio_tabela_json',
    ];
    const patch = {};
    for (const key of copyIfEmpty) {
        if (!emptyRuntimeValue(local[key]) || emptyRuntimeValue(source[key])) continue;
        patch[`system.props.${key}`] = source[key];
    }

    if (Object.keys(patch).length > 0)
        await item.update(patch, { naCsbAutomation: true, naSpecialWeapon: true });

    return { ok: true, canonical, patch };
}

export function normalizeYamatoSide(value = '') {
    const text = normalizeText(value);
    if (text.includes('forseti')) return 'forseti';
    if (text.includes('orochi')) return 'orochi';
    return '';
}

export function isSpecialWeaponAwakened(itemProps = {}) {
    const state = normalizeText(itemProps.arma_especial_estado_atual);
    return Boolean(state) && !state.startsWith('selad');
}

export function rankAtLeast(currentRank = '', requiredRank = '') {
    const ranks = ['D', 'C', 'B', 'A', 'S', 'SS'];
    const current = ranks.indexOf(String(currentRank).toUpperCase());
    const required = ranks.indexOf(String(requiredRank).toUpperCase());
    return current >= 0 && required >= 0 && current >= required;
}

export function yamatoOrochiBonusState(marks = 0) {
    const value = Math.max(0, Math.trunc(Number(marks) || 0));
    if (value >= 7) return { marks: value, bonus: 5, wound: 2 };
    if (value >= 5) return { marks: value, bonus: 4, wound: 2 };
    if (value >= 3) return { marks: value, bonus: 3, wound: 1 };
    if (value >= 1) return { marks: value, bonus: 2, wound: 1 };
    return { marks: value, bonus: 1, wound: 0 };
}

function newPending(item, data = {}) {
    const stamp = combatStamp();
    return {
        version: 1,
        token:
            globalThis.foundry?.utils?.randomID?.() ??
            globalThis.crypto?.randomUUID?.() ??
            String(Date.now()),
        weaponId: item.id,
        weaponName: item.name,
        createdAt: Date.now(),
        ...stamp,
        ...data,
    };
}

async function storePending(actor, pending, extraPatch = {}) {
    await actor.update(
        {
            ...extraPatch,
            [`flags.${MODULE_ID}.${SPECIAL_WEAPON_PENDING_FLAG}`]: pending,
        },
        { naCsbAutomation: true, naSpecialWeapon: true }
    );
    return pending;
}

async function payWound(actor, amount) {
    const cost = Math.max(0, Math.trunc(Number(amount) || 0));
    if (!cost) return 0;
    const current = Math.max(
        0,
        Math.trunc(Number(actor.system?.props?.pdv_slayer_dano_ferida) || 0)
    );
    await actor.update(
        { 'system.props.pdv_slayer_dano_ferida': current + cost },
        { naCsbAutomation: true, naSpecialWeapon: true }
    );
    return cost;
}

async function chooseYamatoSide(item) {
    const current = normalizeYamatoSide(item.system?.props?.arma_lado_dominante);
    if (current) return current;
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Yamato — Lado ativo' },
        content:
            '<div class="na-csb-automation"><p>Defina qual lado está ativo neste despertar.</p></div>',
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'forseti', label: 'Forseti', callback: () => 'forseti' },
            { action: 'orochi', label: 'Yamata no Orochi', callback: () => 'orochi' },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!choice) return '';
    await item.update(
        {
            'system.props.arma_lado_dominante':
                choice === 'forseti' ? 'Forseti' : 'Yamata no Orochi',
        },
        { naCsbAutomation: true, naSpecialWeapon: true }
    );
    return choice;
}

function abilityButton(action, label) {
    return {
        action,
        label,
        callback: () => action,
    };
}

async function yamatoDimensionalProfileIndex(item, actor) {
    const canonical = await canonicalSpecialWeapon(item);
    const attackProps = {
        ...(canonical?.system?.props ?? {}),
        ...(item.system?.props ?? {}),
    };
    const profiles = weaponProfilesForActor(attackProps, actor.system?.props ?? {});
    return profiles.findIndex((profile) =>
        normalizeText(profile.nome).includes('corte dimensional')
    );
}

let specialWeaponRuntimeRegistered = false;

export function registerSpecialWeaponRuntime() {
    if (specialWeaponRuntimeRegistered) return;
    specialWeaponRuntimeRegistered = true;

    Hooks.on('createItem', (item) => {
        if (item?.parent?.documentName !== 'Actor') return;
        const props = item.system?.props ?? {};
        if (
            normalizeText(props.arma_categoria) !== 'especial' &&
            String(props.arma_nome ?? item.name ?? '') !== YAMATO_NAME
        )
            return;
        void hydrateSpecialWeaponItem(item).catch((error) =>
            console.warn?.(`[${MODULE_ID}] Falha ao hidratar arma especial`, error)
        );
    });
}

export async function openSpecialWeaponAbilities(options = {}) {
    const item = await resolveSpecialItem(options);
    if (!item) return ui.notifications?.warn?.('Arma especial não encontrada.');
    const actor = await resolveBearer(item, options);
    if (!actor)
        return ui.notifications?.warn?.(
            'A arma precisa estar vinculada a um Actor para usar habilidades.'
        );

    const hydration = await hydrateSpecialWeaponItem(item);
    const canonicalProps = hydration.canonical?.system?.props ?? {};
    const localProps = item.system?.props ?? {};
    const name = String(localProps.arma_nome ?? item.name ?? '');

    if (name !== YAMATO_NAME)
        return ui.notifications?.info?.(
            `${name || 'Esta arma'} ainda não possui automação executável. O runtime universal já está preparado.`
        );

    const rank = slayerWeaponRank(actor.system?.props ?? {});
    const side = normalizeYamatoSide(localProps.arma_lado_dominante);
    const state = String(localProps.arma_especial_estado_atual ?? 'Selada');
    const marks = Math.max(0, Math.trunc(Number(localProps.arma_marcas_demonio) || 0));
    const basal =
        structured(canonicalProps.arma_especial_habilidades_json, null) ??
        canonicalProps.arma_habilidades_basais_despertar ??
        {};
    const rankEffects =
        structured(canonicalProps.arma_especial_rank_effects_json, null) ??
        canonicalProps.arma_efeitos_por_rank ??
        {};
    const forseti = basal.forseti ?? canonicalProps.arma_habilidades_basais_despertar?.forseti ?? {};
    const orochi = basal.orochi ?? canonicalProps.arma_habilidades_basais_despertar?.orochi ?? {};
    const corte = rankEffects.B ?? canonicalProps.arma_efeitos_por_rank?.B ?? {};

    const content = `
        <div class="na-csb-automation">
            <p><strong>${YAMATO_NAME}</strong></p>
            <p>Rank: <strong>${rank || '—'}</strong> · Estado: <strong>${state}</strong> · Lado: <strong>${side || 'não definido'}</strong> · Marcas: <strong>${marks}</strong></p>
            <hr>
            <p><strong>${forseti.nome || 'Veredito Entre Cortes'}</strong><br>${forseti.efeito || 'Próximo ataque: +2 no acerto e alcance dimensional de 12m.'}</p>
            <p><strong>${orochi.nome || 'Oito Gargantas'}</strong><br>${orochi.efeito || 'Próximo ataque recebe Dano Bônus de Orochi e aplica Sangramento 2.'}</p>
            <p><strong>${corte.nome || 'Corte do Julgamento'}</strong> — Rank B+<br>${corte.base || 'Ataque dimensional a 12m usando o dano atual da Yamato.'}</p>
        </div>`;

    const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Yamato — Habilidades' },
        content,
        modal: true,
        rejectClose: false,
        buttons: [
            abilityButton('yamato.veredito', 'Veredito Entre Cortes'),
            abilityButton('yamato.oito_gargantas', 'Oito Gargantas'),
            abilityButton('yamato.corte_julgamento', 'Corte do Julgamento [Rank B+]'),
            { action: 'close', label: 'Fechar', callback: () => null },
        ],
    });
    if (!selected) return null;
    return useSpecialWeaponAbility({ ...options, item, actor, abilityId: selected });
}

export function specialWeaponPendingForAttack(actor, item) {
    const pending = actor?.getFlag?.(MODULE_ID, SPECIAL_WEAPON_PENDING_FLAG);
    if (!pending || pending.weaponId !== item?.id || !pendingIsCurrent(pending)) return null;
    return pending;
}

export async function clearSpecialWeaponPending(actor, pending = null) {
    if (!actor?.unsetFlag) return;
    const current = actor.getFlag?.(MODULE_ID, SPECIAL_WEAPON_PENDING_FLAG);
    if (!current) return;
    if (pending?.token && current.token !== pending.token) return;
    await actor.unsetFlag(MODULE_ID, SPECIAL_WEAPON_PENDING_FLAG);
}

export async function applySpecialWeaponHitEffects({ actor, item, pending } = {}) {
    if (!pending || pending.weaponId !== item?.id) return;
    const bleed = Math.max(0, Math.trunc(Number(pending.bleedAmount) || 0));
    if (!bleed) return;

    const targets = [...(game.user?.targets ?? [])]
        .map((token) => token.actor)
        .filter(Boolean);
    if (targets.length === 0) {
        ui.notifications?.warn?.(
            `${pending.label || item.name}: acerto confirmado, mas nenhum alvo está marcado para receber Sangramento.`
        );
        return;
    }
    if (targets.length > 1)
        ui.notifications?.warn?.(
            `${pending.label || item.name}: habilidade de alvo único; Sangramento aplicado somente em ${targets[0].name}.`
        );

    await applyStackingBreathingStatus(targets[0], 'sangramento', {
        damageFormula: String(bleed),
        remainingTurns: Math.max(1, Math.trunc(Number(pending.bleedTurns) || 1)),
        sourceName: `${item.name} · ${pending.label || 'Habilidade'}`,
        tick: 'start',
        stacks: 1,
    });
}

export async function rollSpecialWeaponItem(options = {}) {
    const item = await resolveSpecialItem(options);
    if (!item) return ui.notifications?.warn?.('Item de arma não encontrado.');
    const actor = await resolveBearer(item, options);
    if (!actor)
        return ui.notifications?.warn?.(
            'A arma precisa estar vinculada a um Caçador para calcular o ataque.'
        );

    const pending = specialWeaponPendingForAttack(actor, item);
    if (!pending) {
        const stale = actor.getFlag?.(MODULE_ID, SPECIAL_WEAPON_PENDING_FLAG);
        if (stale?.weaponId === item.id && !pendingIsCurrent(stale))
            await clearSpecialWeaponPending(actor, stale);
        const { rollWeaponItem } = await import('./damage-service.mjs');
        return rollWeaponItem({ ...options, item, actor, startWithHit: true });
    }

    const { rollHit } = await import('./hit-service.mjs');
    const result = await rollHit({
        actor,
        requiredWeaponId: item.id,
        requiredWeaponProfileIndex: Number.isInteger(pending.requiredWeaponProfileIndex)
            ? pending.requiredWeaponProfileIndex
            : undefined,
        forceActionType: pending.forceActionType || undefined,
        bonus: Number(pending.hitBonus) || 0,
        advantage: pending.advantage === true,
        autoDamage: true,
    });

    if (result?.attempts?.length && pending.deferWound === true && Number(pending.woundCost) > 0)
        await payWound(actor, pending.woundCost);

    if (result?.attempts?.length && result.hits < 1)
        await clearSpecialWeaponPending(actor, pending);

    return result;
}

export async function useSpecialWeaponAbility(options = {}) {
    const item = await resolveSpecialItem(options);
    if (!item) return ui.notifications?.warn?.('Arma especial não encontrada.');
    const actor = await resolveBearer(item, options);
    if (!actor)
        return ui.notifications?.warn?.(
            'A arma precisa estar vinculada a um Actor para usar habilidades.'
        );

    await hydrateSpecialWeaponItem(item);
    const props = item.system?.props ?? {};
    const name = String(props.arma_nome ?? item.name ?? '');
    const abilityId = String(options.abilityId ?? '');

    if (name !== YAMATO_NAME)
        return ui.notifications?.warn?.('Esta habilidade ainda não possui runtime implementado.');

    if (!isSpecialWeaponAwakened(props))
        return ui.notifications?.warn?.(
            'Yamato está Selada. Defina Primeiro Despertar ou Despertar Verdadeiro antes de usar habilidades do despertar.'
        );

    const side = await chooseYamatoSide(item);
    if (!side) return null;
    const marks = Math.max(0, Math.trunc(Number(item.system?.props?.arma_marcas_demonio) || 0));
    const orochi = yamatoOrochiBonusState(marks);

    if (abilityId === 'yamato.veredito') {
        if (side !== 'forseti')
            return ui.notifications?.warn?.('Veredito Entre Cortes exige Forseti como lado ativo.');
        const action = await consumeSlayerActions(actor, ['especial'], { update: false });
        if (!action.ok) return ui.notifications?.warn?.(action.reason);
        const profileIndex = await yamatoDimensionalProfileIndex(item, actor);
        const pending = newPending(item, {
            source: 'yamato.veredito',
            label: 'Veredito Entre Cortes',
            hitBonus: 2,
            range: 12,
            requiredWeaponProfileIndex: profileIndex >= 0 ? profileIndex : undefined,
        });
        await storePending(actor, pending, action.patch);
        ui.notifications?.info?.(
            'Veredito Entre Cortes preparado: próximo ataque da Yamato neste turno recebe +2 no acerto e alcance de 12m.'
        );
        return pending;
    }

    if (abilityId === 'yamato.oito_gargantas') {
        if (side !== 'orochi')
            return ui.notifications?.warn?.('Oito Gargantas exige Yamata no Orochi como lado ativo.');
        const action = await consumeSlayerActions(actor, ['especial'], { update: false });
        if (!action.ok) return ui.notifications?.warn?.(action.reason);
        const pending = newPending(item, {
            source: 'yamato.oito_gargantas',
            label: 'Oito Gargantas',
            damageBonus: orochi.bonus,
            bleedAmount: 2,
            bleedTurns: 1,
            woundCost: orochi.wound,
        });
        const currentWound = Math.max(
            0,
            Math.trunc(Number(actor.system?.props?.pdv_slayer_dano_ferida) || 0)
        );
        const extraPatch =
            orochi.wound > 0
                ? {
                      ...action.patch,
                      'system.props.pdv_slayer_dano_ferida': currentWound + orochi.wound,
                  }
                : action.patch;
        await storePending(actor, pending, extraPatch);
        ui.notifications?.info?.(
            `Oito Gargantas preparado: +${orochi.bonus} dano no próximo ataque; Sangramento 2 por 1 turno${orochi.wound ? `; custo ${orochi.wound} Ferida` : ''}.`
        );
        return pending;
    }

    if (abilityId === 'yamato.corte_julgamento') {
        const rank = slayerWeaponRank(actor.system?.props ?? {});
        if (!rankAtLeast(rank, 'B'))
            return ui.notifications?.warn?.(
                `Corte do Julgamento exige Rank B. Rank atual: ${rank || 'abaixo de D'}.`
            );

        const profileIndex = await yamatoDimensionalProfileIndex(item, actor);
        if (profileIndex < 0)
            return ui.notifications?.warn?.(
                'Perfil Corte Dimensional não foi encontrado na Yamato.'
            );

        const iai = normalizeText(item.system?.props?.arma_especial_forma_atual).includes('iai');
        const pending = newPending(item, {
            source: 'yamato.corte_julgamento',
            label: 'Corte do Julgamento',
            hitBonus: side === 'forseti' ? 1 : 0,
            damageBonus: side === 'orochi' ? orochi.bonus : 0,
            bleedAmount: iai ? 2 : 0,
            bleedTurns: 1,
            woundCost: side === 'orochi' ? orochi.wound : 0,
            deferWound: side === 'orochi' && orochi.wound > 0,
            range: 12,
            requiredWeaponProfileIndex: profileIndex,
            forceActionType: 'ataque',
        });
        await storePending(actor, pending);
        return rollSpecialWeaponItem({ item, actor });
    }

    return ui.notifications?.warn?.(`Habilidade desconhecida: ${abilityId}`);
}
