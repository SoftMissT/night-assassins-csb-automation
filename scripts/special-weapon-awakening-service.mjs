import { MODULE_ID } from './constants.mjs';
import {
    dualSoulCeremonyCompleted,
    getDualSoulCeremonyState,
    isDualSoulWeapon,
} from './dual-soul-ceremony-service.mjs';
import { hydrateSpecialWeaponItem, YAMATO_NAME } from './special-weapon-service.mjs';
import {
    SPECIAL_WEAPON_AWAKENING_STATE,
    awakeningDuration,
    awakeningExpired,
    awakeningRuntime,
} from './special-weapon-awakening-core.mjs';

const RUNTIME_KEY = 'arma_especial_despertar_runtime_json';
const USED_COMBAT_FLAG = 'specialWeaponAwakeningUsedCombat';
const LEGACY_YAMATO_USED_COMBAT_FLAG = 'yamatoAwakeningUsedCombat';

function structured(value, fallback = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : fallback;
    } catch {
        return fallback;
    }
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function resolveItem(options = {}) {
    if (options.item && options.item.documentName !== 'Actor') return options.item;
    if (options.itemUuid) return fromUuid(options.itemUuid);
    return null;
}

async function resolveActor(item, options = {}) {
    if (item?.parent?.documentName === 'Actor') return item.parent;
    if (options.actor?.documentName === 'Actor') return options.actor;
    if (options.actorUuid) {
        const document = await fromUuid(options.actorUuid);
        return document?.actor ?? document;
    }
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

function actorItems(actor) {
    if (Array.isArray(actor?.items?.contents)) return actor.items.contents;
    try {
        return [...(actor?.items ?? [])];
    } catch {
        return [];
    }
}

async function chooseDualSoulWeapon(actor, options = {}) {
    const explicit = await resolveItem(options);
    if (explicit) return isDualSoulWeapon(explicit) ? explicit : null;
    const weapons = actorItems(actor).filter(isDualSoulWeapon);
    if (weapons.length <= 1) return weapons[0] ?? null;

    const selected = await foundry.applications.api.DialogV2.wait({
        classes: ['na-dual-soul-dialog'],
        window: { title: 'Ativar Arma de Dupla Alma' },
        content: '<div class="na-csb-automation na-dual-soul-panel"><span class="na-dual-soul-kicker">Arma de Dupla Alma</span><h2>Qual vínculo será ativado?</h2><p>Escolha a arma cuja Cerimônia já foi concluída.</p></div>',
        modal: true,
        rejectClose: false,
        buttons: [
            ...weapons.map((weapon, index) => ({
                action: `weapon-${index}`,
                label: weapon.name,
                callback: () => weapon.uuid ?? weapon.id,
            })),
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    return weapons.find((weapon) => (weapon.uuid ?? weapon.id) === selected) ?? null;
}

function awakeningDefinition(props = {}) {
    const definition = structured(props.dupla_alma_despertar_json, {});
    const source = structured(props.arma_despertar, {});
    const sealed = definition.estado_selado ?? source.estado_selado ?? {};
    const first = definition.primeiro_despertar ?? source.primeiro_despertar ?? {};
    return {
        sealedName: String(sealed?.nome ?? sealed ?? 'Estado Selado').trim(),
        firstName: String(first?.nome ?? first ?? 'Primeiro Despertar').trim(),
    };
}

function ceremonySide(ceremony, props = {}) {
    const kind = ceremony?.dominance?.dominantKind;
    if (kind === 'entidade') return { kind, name: String(props.arma_entidade ?? 'Entidade') };
    if (kind === 'demonio') return { kind, name: String(props.arma_demonio ?? 'Demônio') };
    return null;
}

async function chooseEquilibriumSide(props = {}) {
    const entity = String(props.arma_entidade ?? 'Entidade');
    const demon = String(props.arma_demonio ?? 'Demônio');
    return foundry.applications.api.DialogV2.wait({
        classes: ['na-dual-soul-dialog'],
        window: { title: 'Equilíbrio Instável' },
        content: '<div class="na-csb-automation na-dual-soul-panel"><span class="na-dual-soul-kicker">Equilíbrio Instável</span><h2>Quem responde ao despertar?</h2><p>Escolha o lado que ficará ativo neste Primeiro Despertar. A Cerimônia permanente não será alterada.</p></div>',
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'entity', label: entity, callback: () => ({ kind: 'entidade', name: entity }) },
            { action: 'demon', label: demon, callback: () => ({ kind: 'demonio', name: demon }) },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
}

function legacySide(item, side) {
    const name = String(item?.system?.props?.arma_nome ?? item?.name ?? '');
    if (name !== YAMATO_NAME) return side.kind;
    return side.kind === 'entidade' ? 'forseti' : 'orochi';
}

function integrationName(props = {}) {
    return String(props.arma_especial_integracao ?? '').trim() || 'Dualidade';
}

function ritualDefinition(props = {}) {
    return structured(props.arma_ritual, {});
}

function ritualHtml(item, side, integration, duration) {
    return `<div class="na-csb-automation na-dual-soul-panel">
        <span class="na-dual-soul-kicker">Primeiro Despertar</span>
        <h2>${escapeHtml(item.name)}</h2>
        <div class="na-dual-soul-summary"><span>Vínculo</span><strong>Cerimônia concluída</strong></div>
        <div class="na-dual-soul-facts">
            <p><span>Lado</span><strong>${escapeHtml(side.name)} · ${escapeHtml(side.kind)}</strong></p>
            <p><span>Integração</span><strong>${escapeHtml(integration)} · ${duration} rodadas</strong></p>
        </div>
        <p class="na-dual-soul-footnote">O Sangue de Pacto já foi pago ao concluir a Cerimônia de Vínculo. Esta ativação não reduz o PDV novamente.</p>
    </div>`;
}

async function sealSpecialWeapon(item) {
    if (!item?.update || !isDualSoulWeapon(item)) return false;
    const props = item.system?.props ?? {};
    const definition = awakeningDefinition(props);
    await item.update({
        'system.props.arma_especial_estado_atual': SPECIAL_WEAPON_AWAKENING_STATE.sealed,
        'system.props.arma_especial_forma_atual': definition.sealedName,
        'system.props.arma_especial_recurso_resumo': '',
        [`system.props.${RUNTIME_KEY}`]: '{}',
    }, {
        naCsbAutomation: true,
        naSpecialWeapon: true,
        naLifeDeath: true,
    });
    return true;
}

export async function awakenSpecialWeapon(options = {}) {
    let actor = await resolveActor(null, options);
    const item = await chooseDualSoulWeapon(actor, options);
    if (!item) return ui.notifications?.warn?.('Selecione uma Arma de Dupla Alma vinculada ao portador.');
    actor = await resolveActor(item, options);
    if (!actor?.update) return ui.notifications?.warn?.('A arma precisa estar vinculada a um Actor.');
    if (!game.combat?.started) return ui.notifications?.warn?.('O Primeiro Despertar deve ser ativado durante um combate.');

    const usedCombat = item.getFlag?.(MODULE_ID, USED_COMBAT_FLAG)
        ?? item.getFlag?.(MODULE_ID, LEGACY_YAMATO_USED_COMBAT_FLAG);
    if (usedCombat === game.combat.id)
        return ui.notifications?.warn?.('O Primeiro Despertar desta arma já foi usado neste combate.');

    await hydrateSpecialWeaponItem(item);
    if (!dualSoulCeremonyCompleted(item))
        return ui.notifications?.warn?.('Esta arma ainda não realizou a Cerimônia de Vínculo.');

    const props = item.system?.props ?? {};
    const active = structured(props[RUNTIME_KEY], {});
    if (active.state === SPECIAL_WEAPON_AWAKENING_STATE.first)
        return ui.notifications?.warn?.('Esta arma já está em Primeiro Despertar.');

    const ceremony = getDualSoulCeremonyState(item);
    let side = ceremonySide(ceremony, props);
    if (ceremony?.dominance?.dominantKind === 'equilibrio') side = await chooseEquilibriumSide(props);
    if (!side) return null;

    const integration = integrationName(props);
    const duration = awakeningDuration(integration);
    const ritual = ritualDefinition(props);
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ['na-dual-soul-dialog'],
        window: { title: `${item.name} — Primeiro Despertar` },
        content: ritualHtml(item, side, integration, duration),
        modal: true,
        rejectClose: false,
    });
    if (!confirmed) return null;

    const definition = awakeningDefinition(props);
    const runtime = awakeningRuntime({
        combatId: game.combat.id,
        round: game.combat.round ?? 0,
        duration,
        side: legacySide(item, side),
        sideKind: side.kind,
        sideName: side.name,
        weaponId: item.id,
        weaponName: item.name,
        ritualName: ritual.nome ?? '',
    });
    runtime.integration = integration;
    runtime.ceremonyDominance = ceremony?.dominance ?? null;

    await item.update({
        'system.props.arma_especial_estado_atual': SPECIAL_WEAPON_AWAKENING_STATE.first,
        'system.props.arma_especial_forma_atual': definition.firstName,
        'system.props.arma_especial_recurso_resumo': `${side.name} · ${integration} · ${duration} rodadas`,
        [`system.props.${RUNTIME_KEY}`]: JSON.stringify(runtime),
    }, {
        naCsbAutomation: true,
        naSpecialWeapon: true,
        naLifeDeath: true,
        naBloodPact: true,
    });
    await item.setFlag?.(MODULE_ID, USED_COMBAT_FLAG, game.combat.id);

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="na-csb-automation na-dual-soul-chat"><h3>${escapeHtml(item.name)} — Primeiro Despertar</h3><p><strong>${escapeHtml(side.name)}</strong> respondeu ao vínculo.</p><p>${duration} rodadas. O Sangue de Pacto já foi oferecido na Cerimônia de Vínculo.</p></div>`,
    });
    actor.sheet?.render?.(false);
    ui.notifications?.info?.(`${item.name}: Primeiro Despertar ativado sem nova cobrança de PDV.`);
    return { ok: true, runtime, ceremony };
}

// Alias de compatibilidade para macros e integrações publicadas na v0.11.62.
export async function awakenYamato(options = {}) {
    return awakenSpecialWeapon(options);
}

export async function openSpecialWeaponAwakeningManager(options = {}) {
    let actor = await resolveActor(null, options);
    const item = await chooseDualSoulWeapon(actor, options);
    if (!item) return ui.notifications?.warn?.('Selecione uma Arma de Dupla Alma vinculada ao portador.');
    actor = await resolveActor(item, options);
    await hydrateSpecialWeaponItem(item);
    const ceremony = getDualSoulCeremonyState(item);
    const state = String(item.system?.props?.arma_especial_estado_atual ?? SPECIAL_WEAPON_AWAKENING_STATE.sealed);
    const ceremonyState = dualSoulCeremonyCompleted(item)
        ? ceremony?.dominance?.display ?? 'Concluída'
        : 'NÃO REALIZADA';
    const choice = await foundry.applications.api.DialogV2.wait({
        classes: ['na-dual-soul-dialog'],
        window: { title: `${item.name} — Gerenciar Despertar` },
        content: `<div class="na-csb-automation na-dual-soul-panel"><span class="na-dual-soul-kicker">Controle da arma</span><h2>${escapeHtml(item.name)}</h2><div class="na-dual-soul-facts"><p><span>Cerimônia</span><strong>${escapeHtml(ceremonyState)}</strong></p><p><span>Estado</span><strong>${escapeHtml(state)}</strong></p></div><p class="na-dual-soul-footnote">A Cerimônia de Vínculo já rompeu o selo e cobrou o Sangue de Pacto. Ativar o Primeiro Despertar não reduz o PDV novamente.</p></div>`,
        modal: true,
        rejectClose: false,
        buttons: [
            { action: 'awaken', label: 'Ativar Primeiro Despertar', callback: () => 'awaken' },
            { action: 'seal', label: 'Encerrar Despertar', callback: () => 'seal' },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (choice === 'awaken') return awakenSpecialWeapon({ ...options, actor, item });
    if (choice === 'seal') return sealSpecialWeapon(item);
    return null;
}

let registered = false;

function isPrimaryGm() {
    const primary = game.users?.filter((user) => user.active && user.isGM)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    return game.user?.isGM && primary?.id === game.user.id;
}

export function registerSpecialWeaponAwakeningRuntime() {
    if (registered) return;
    registered = true;
    Hooks.on('updateCombat', (combat, changes) => {
        if (!isPrimaryGm() || !Object.hasOwn(changes, 'round')) return;
        for (const combatant of combat.combatants ?? []) {
            for (const item of actorItems(combatant.actor)) {
                if (!isDualSoulWeapon(item)) continue;
                const runtime = structured(item.system?.props?.[RUNTIME_KEY], {});
                if (awakeningExpired(runtime, combat)) void sealSpecialWeapon(item);
            }
        }
    });
}
