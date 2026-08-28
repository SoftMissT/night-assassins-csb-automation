/**
 * @fileoverview Descanso do Slayer com confirmação autoritativa do GM.
 */

import { MODULE_ID, STATUS_SLAYER } from './constants.mjs';
import { parseNumber } from './parsing.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';
import {
    consolidateWindScars,
    parseWindBreathingState,
    windStatePatch,
    WIND_STATE_KEY,
} from './wind-breathing-service.mjs';

const SOCKET_NAME = `module.${MODULE_ID}`;
const REQUEST_TYPE = 'requestSlayerRest';
const RESPONSE_TYPE = 'requestSlayerRestResult';
const REQUEST_TIMEOUT_MS = 120000;
const pendingRequests = new Map();
const STATUS_LABELS = new Map(STATUS_SLAYER.map(({ key, label }) => [key, label]));

const RESTS = Object.freeze({
    field: { label: 'Descanso de Campo', hours: 2 },
    complete: { label: 'Descanso Completo', hours: 8 },
    deep: { label: 'Recuperação Profunda', hours: 24 },
});

const LIGHT_STATUSES = Object.freeze([
    'amedrontado',
    'desequilibrado',
    'desorientado',
    'distraido',
    'empurrado',
    'surdez_parcial',
    'cegueira_parcial',
]);
const COMPLETE_STATUSES = Object.freeze([
    ...LIGHT_STATUSES,
    'sangramento',
    'hemorragia',
    'envenenamento',
    'em_chamas',
    'hipotermia',
    'confuso',
    'fadiga_corporal',
    'fadiga_espiritual',
    'fadiga_mental',
]);
const DEEP_STATUSES = Object.freeze([...COMPLETE_STATUSES, 'silenciado']);
const DEEP_TREATMENT_STATUSES = Object.freeze(['fratura', 'corrupcao']);

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function parseRestData(value) {
    try {
        const text = String(value ?? '')
            .replace(/<[^>]*>/g, '')
            .replaceAll('&quot;', '"')
            .trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
    } catch {
        return null;
    }
}

export function resolveRestTier(requested, completedHours) {
    const hours = Math.max(0, Number(completedHours) || 0);
    if (requested === 'field') return hours >= 2 ? 'field' : null;
    if (requested === 'complete') return hours >= 8 ? 'complete' : hours >= 2 ? 'field' : null;
    if (requested === 'deep') return hours >= 24 ? 'deep' : hours >= 8 ? 'complete' : null;
    return null;
}

export function restEligibleStatuses(tier) {
    if (tier === 'field') return [...LIGHT_STATUSES];
    if (tier === 'complete') return [...COMPLETE_STATUSES];
    if (tier === 'deep') return [...DEEP_STATUSES];
    return [];
}

function resourceSnapshot(props = {}) {
    const pdvMaximum = Math.max(
        0,
        parseNumber(props.pdv_slayer_total_conta) -
            parseNumber(props.pdv_slayer_dano_ferida) +
            parseNumber(props.pdv_slayer_extra)
    );
    const pdvCurrent = clamp(
        pdvMaximum +
            parseNumber(props.pdv_slayer_curado) -
            parseNumber(props.pdv_slayer_dano_tomado),
        0,
        pdvMaximum
    );
    const pdrMaximum = Math.max(
        0,
        parseNumber(props.pdr_slayer_total_conta) +
            parseNumber(props.metal_slayer_pdr_bonus) +
            parseNumber(props.pdr_slayer_extra)
    );
    const pdrCurrent = clamp(
        pdrMaximum +
            parseNumber(props.pdr_slayer_curado) -
            parseNumber(props.pdr_slayer_gasto_valor),
        0,
        pdrMaximum
    );
    const breathMaximum = Math.max(
        0,
        parseNumber(props.folego_slayer_maximo) || 2 + parseNumber(props.fdv_display)
    );
    return { pdvMaximum, pdvCurrent, pdrMaximum, pdrCurrent, breathMaximum };
}

export function buildRestPatch(props = {}, resolution = {}) {
    const tier = resolution.tier;
    if (!RESTS[tier]) throw new Error('Benefício de descanso inválido.');
    const woundHealing =
        tier === 'deep'
            ? Math.min(
                  parseNumber(props.pdv_slayer_dano_ferida),
                  Math.max(0, Number(resolution.woundHealing) || 0)
              )
            : 0;
    const resourceProps =
        woundHealing > 0
            ? {
                  ...props,
                  pdv_slayer_dano_ferida: parseNumber(props.pdv_slayer_dano_ferida) - woundHealing,
              }
            : props;
    const resources = resourceSnapshot(resourceProps);
    const state = parseStatusState(props.status_slayer_dados);
    const allowed = new Set(restEligibleStatuses(tier));
    if (tier === 'deep') DEEP_TREATMENT_STATUSES.forEach((key) => allowed.add(key));
    const removed = [...new Set(resolution.removeStatuses ?? [])].filter(
        (key) => allowed.has(key) && state.active.includes(key)
    );
    const active = state.active.filter((key) => !removed.includes(key));
    const effects = Object.fromEntries(
        Object.entries(state.effects).filter(([key]) => active.includes(key))
    );
    const exhaustion =
        tier === 'field'
            ? state.exhaustion
            : tier === 'complete'
              ? Math.max(0, state.exhaustion - 2)
              : resolution.deepExhaustion === 'reduce4'
                ? Math.max(0, state.exhaustion - 4)
                : 0;
    const nextState = {
        ...state,
        active,
        effects,
        exhaustion,
        exhaustionMilestones: state.exhaustionMilestones.filter((level) => exhaustion >= level),
    };
    const patch = {
        'system.props.folego_slayer_atual': resources.breathMaximum,
        'system.props.status_slayer_dados': JSON.stringify(nextState),
        'system.props.status_slayer_resumo': formatStatusSummary(active, exhaustion),
        'system.props.status_slayer_exaustao': exhaustion,
        'system.props.descanso_slayer_dados': JSON.stringify(resolution.record),
    };
    if (woundHealing > 0)
        patch['system.props.pdv_slayer_dano_ferida'] =
            parseNumber(props.pdv_slayer_dano_ferida) - woundHealing;
    // Passiva Sangue Especial (Respiração do Vento): cicatrizes/bônus de VIT
    // acumulados na batalha só se consolidam permanentemente no Descanso
    // Longo ("Recuperação Profunda"), conforme o .md ("após um descanso
    // longo, aplicados após a última batalha").
    if (tier === 'deep' && props[WIND_STATE_KEY]) {
        const windState = parseWindBreathingState(props[WIND_STATE_KEY]);
        Object.assign(patch, windStatePatch(consolidateWindScars(windState)));
    }
    let pdvRecovered = 0;
    let pdrRecovered = 0;
    if (tier === 'field') {
        pdvRecovered = Math.min(
            Math.max(0, resources.pdvMaximum - resources.pdvCurrent),
            Math.max(0, Number(resolution.fieldPdvRoll) || 0)
        );
        pdrRecovered = Math.min(
            Math.max(0, resources.pdrMaximum - resources.pdrCurrent),
            Math.floor(resources.pdrMaximum / 2)
        );
        patch['system.props.pdv_slayer_curado'] =
            parseNumber(props.pdv_slayer_curado) + pdvRecovered;
        patch['system.props.pdr_slayer_curado'] =
            parseNumber(props.pdr_slayer_curado) + pdrRecovered;
    } else {
        pdvRecovered = Math.max(0, resources.pdvMaximum - resources.pdvCurrent);
        pdrRecovered = Math.max(0, resources.pdrMaximum - resources.pdrCurrent);
        patch['system.props.pdv_slayer_dano_tomado'] = 0;
        patch['system.props.pdv_slayer_curado'] = 0;
        patch['system.props.pdr_slayer_gasto_valor'] = 0;
        patch['system.props.pdr_slayer_curado'] = 0;
    }
    return { patch, removed, exhaustion, pdvRecovered, pdrRecovered, woundHealing, resources };
}

function primaryActiveGm() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

async function resolveActor(actorUuid) {
    if (actorUuid) {
        const document = await fromUuid(actorUuid);
        const actor = document?.actor ?? document;
        if (actor?.documentName === 'Actor' || actor?.system?.props) return actor;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

async function requestRestChoice(actor) {
    return foundry.applications.api.DialogV2.wait({
        window: { title: `Descanso — ${actor.name}` },
        position: { width: 560, height: 'auto' },
        modal: true,
        rejectClose: false,
        content: `<fieldset><legend>Escolha o descanso</legend>
      <div class="form-group"><label>Modalidade planejada</label><div class="form-fields"><select name="restType">
        <option value="field">Descanso de Campo · 2 horas</option>
        <option value="complete">Descanso Completo · 8 horas</option>
        <option value="deep">Recuperação Profunda · 24 horas ou mais</option>
      </select></div></div>
      <div class="form-group"><label>Horas realmente concluídas</label><div class="form-fields"><input type="number" name="completedHours" min="0" step="0.5" value="2"></div></div>
      <p class="hint">Se o descanso foi interrompido, o módulo aplicará apenas a modalidade inferior alcançada.</p>
    </fieldset>`,
        buttons: [
            {
                action: 'request',
                label: 'Solicitar ao GM',
                default: true,
                callback: (_event, button) => ({
                    requested: String(button.form.elements.restType.value),
                    completedHours: Number(button.form.elements.completedHours.value),
                }),
            },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
}

function statusChoices(active, tier) {
    const eligible = new Set(restEligibleStatuses(tier));
    return active
        .filter((key) => eligible.has(key))
        .map(
            (key) => `<label style="display:flex;gap:7px;align-items:center">
    <input type="checkbox" name="removeStatus" value="${escapeHtml(key)}">${escapeHtml(STATUS_LABELS.get(key) ?? key)}</label>`
        )
        .join('');
}

async function requestGmApproval(actor, requester, request, tier, fieldRoll) {
    const props = actor.system?.props ?? {};
    const state = parseStatusState(props.status_slayer_dados);
    const previous = parseRestData(props.descanso_slayer_dados);
    const choices = statusChoices(state.active, tier);
    return foundry.applications.api.DialogV2.wait({
        window: { title: 'Autorizar descanso do Slayer' },
        position: { width: 690, height: 'auto' },
        modal: true,
        rejectClose: false,
        content: `<fieldset><legend>${escapeHtml(RESTS[tier].label)}</legend>
      <div class="form-group"><label>Jogador</label><div class="form-fields"><strong>${escapeHtml(requester.name)}</strong></div></div>
      <div class="form-group"><label>Personagem</label><div class="form-fields"><strong>${escapeHtml(actor.name)}</strong></div></div>
      <div class="form-group"><label>Tempo concluído</label><div class="form-fields">${request.completedHours}h</div></div>
      ${fieldRoll ? `<div class="form-group"><label>Recuperação de PDV</label><div class="form-fields"><strong>${fieldRoll}</strong> (1d4 × VIT ${Math.max(1, Math.trunc(parseNumber(props.vit_display)))})</div></div>` : ''}
    </fieldset>
    <fieldset><legend>Regra antiabuso</legend>
      ${previous ? `<p class="hint">Já existe benefício anterior registrado: ${escapeHtml(previous.label ?? previous.tier ?? 'descanso')}.</p>` : `<p class="hint">Primeiro benefício registrado para esta ficha.</p>`}
      <label style="display:flex;gap:7px;align-items:flex-start"><input type="checkbox" name="progressConfirmed" ${previous ? '' : 'checked'}>
        Houve novo combate, missão, exploração perigosa, desgaste ou avanço real de tempo aprovado.</label>
    </fieldset>
    <fieldset><legend>Status removíveis</legend>${choices || `<p class="hint">Nenhum status ativo pode ser removido por este descanso.</p>`}</fieldset>
    ${
        tier === 'deep'
            ? `<fieldset><legend>Recuperação Profunda</legend>
      <div class="form-group"><label>Exaustão</label><div class="form-fields"><select name="deepExhaustion"><option value="clear">Remover toda</option><option value="reduce4">Reduzir 4 níveis</option></select></div></div>
      ${
          state.active.includes('fratura')
              ? `<label style="display:flex;gap:7px;align-items:center"><input type="checkbox" name="treatFracture">Tratar Fratura agora</label>
        <div class="form-group"><label>Teste da Fratura</label><div class="form-fields"><select name="fractureAttr"><option value="VIT">VIT do alvo</option><option value="SAB">SAB do tratador</option></select><input type="number" name="healerSab" value="0" title="Bônus de SAB do tratador"></div></div>`
              : ''
      }
      ${
          state.active.includes('corrupcao')
              ? `<label style="display:flex;gap:7px;align-items:center"><input type="checkbox" name="purifyCorruption">Existe ritual ou método narrativo para purificar Corrupção</label>
        <div class="form-group"><label>CD da purificação</label><div class="form-fields"><input type="number" name="corruptionDc" min="1" max="99" value="15"></div></div>`
              : ''
      }
      ${
          parseNumber(props.pdv_slayer_dano_ferida) > 0
              ? `<div class="form-group"><label>PDV máximo devolvido por tratamento importante</label><div class="form-fields"><input type="number" name="woundHealing" min="0" max="${parseNumber(props.pdv_slayer_dano_ferida)}" value="0"></div></div>
        <p class="hint">Ferida não é apagada pelo descanso. Informe somente o valor autorizado por tratamento, item, técnica ou cena entre arcos.</p>`
              : ''
      }
    </fieldset>`
            : ''
    }`,
        buttons: [
            { action: 'deny', label: 'Recusar', callback: () => ({ approved: false }) },
            {
                action: 'approve',
                label: 'Autorizar e aplicar',
                default: true,
                callback: (_event, button) => {
                    const form = new FormData(button.form);
                    return {
                        approved: form.get('progressConfirmed') === 'on',
                        error:
                            form.get('progressConfirmed') === 'on'
                                ? ''
                                : 'Confirme a regra antiabuso para autorizar.',
                        removeStatuses: form.getAll('removeStatus'),
                        deepExhaustion: form.get('deepExhaustion') || 'clear',
                        treatFracture: form.get('treatFracture') === 'on',
                        fractureAttr: form.get('fractureAttr') || 'VIT',
                        healerSab: Number(form.get('healerSab')) || 0,
                        purifyCorruption: form.get('purifyCorruption') === 'on',
                        corruptionDc: Math.max(1, Number(form.get('corruptionDc')) || 15),
                        woundHealing: Math.max(0, Number(form.get('woundHealing')) || 0),
                    };
                },
            },
        ],
    });
}

async function rollDeepTreatments(actor, approval) {
    const removeStatuses = [...approval.removeStatuses];
    const notes = [];
    if (approval.treatFracture) {
        const modifier =
            approval.fractureAttr === 'SAB'
                ? approval.healerSab
                : parseNumber(actor.system?.props?.vit_display);
        const roll = await new Roll(`1d20 + ${modifier}`).evaluate();
        const natural =
            Number(roll.dice?.[0]?.results?.find?.((result) => result.active !== false)?.result) ||
            0;
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: 'Recuperação Profunda — tratamento de Fratura contra CD 14',
        });
        if (Number(roll.total) >= 14 || natural === 20) removeStatuses.push('fratura');
        notes.push(
            natural === 1
                ? 'Fratura: falha crítica; o GM pode aplicar Fadiga Corporal.'
                : Number(roll.total) >= 14
                  ? 'Fratura tratada.'
                  : 'Fratura permanece.'
        );
    }
    if (approval.purifyCorruption) {
        const modifier = parseNumber(actor.system?.props?.fdv_display);
        const roll = await new Roll(`1d20 + ${modifier}`).evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `Recuperação Profunda — purificação de Corrupção contra CD ${approval.corruptionDc}`,
        });
        if (Number(roll.total) >= approval.corruptionDc) removeStatuses.push('corrupcao');
        notes.push(
            Number(roll.total) >= approval.corruptionDc
                ? 'Corrupção purificada.'
                : 'Corrupção permanece.'
        );
    }
    return { removeStatuses: [...new Set(removeStatuses)], notes };
}

async function applyApprovedRest(actor, requester, request) {
    const tier = resolveRestTier(request.requested, request.completedHours);
    if (!tier) throw new Error('O tempo concluído não alcançou nenhum benefício de descanso.');
    const vitality = Math.max(1, Math.trunc(parseNumber(actor.system?.props?.vit_display)));
    const roll = tier === 'field' ? await new Roll('1d4').evaluate() : null;
    const fieldPdvRecovery = (Number(roll?.total) || 0) * vitality;
    if (roll)
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${RESTS[tier].label} — 1d4 × VIT (${vitality})`,
        });
    const approval = await requestGmApproval(actor, requester, request, tier, fieldPdvRecovery);
    if (!approval?.approved) throw new Error(approval?.error || 'O GM recusou o descanso.');
    const treatments =
        tier === 'deep'
            ? await rollDeepTreatments(actor, approval)
            : { removeStatuses: approval.removeStatuses, notes: [] };
    const record = {
        version: 1,
        id: foundry.utils.randomID(),
        tier,
        label: RESTS[tier].label,
        requested: request.requested,
        completedHours: request.completedHours,
        worldTime: Number(game.time?.worldTime) || 0,
        sceneId: canvas.scene?.id ?? null,
        approvedBy: game.user.id,
    };
    const result = buildRestPatch(actor.system?.props ?? {}, {
        tier,
        fieldPdvRoll: fieldPdvRecovery,
        removeStatuses: treatments.removeStatuses,
        deepExhaustion: approval.deepExhaustion,
        woundHealing: approval.woundHealing,
        record,
    });
    await actor.update(result.patch, { naCsbAutomation: true });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="na-rest-card"><strong>${escapeHtml(RESTS[tier].label)} — ${escapeHtml(actor.name)}</strong><hr>
      <p>PDV recuperado: <strong>${result.pdvRecovered}</strong> · PDR recuperado: <strong>${result.pdrRecovered}</strong> · Fôlego restaurado.</p>
      <p>Exaustão atual: <strong>${result.exhaustion}</strong>${result.removed.length ? ` · Removidos: ${escapeHtml(result.removed.map((key) => STATUS_LABELS.get(key) ?? key).join(', '))}` : ''}</p>
      ${result.woundHealing ? `<p>Ferida tratada: <strong>${result.woundHealing}</strong> de PDV máximo devolvido.</p>` : ''}
      ${treatments.notes.length ? `<p>${escapeHtml(treatments.notes.join(' '))}</p>` : ''}</div>`,
    });
    return { ok: true, tier, actorName: actor.name, ...result };
}

function emitResult(message, result) {
    game.socket.emit(SOCKET_NAME, {
        type: RESPONSE_TYPE,
        recipientId: message.requesterId,
        requestId: message.requestId,
        ...result,
    });
}

async function handleRestRequest(message) {
    if (!game.user.isGM || message.gmId !== game.user.id) return;
    const requester = game.users.get(message.requesterId);
    const actor = await resolveActor(message.actorUuid);
    if (!requester?.active || !actor)
        return emitResult(message, { ok: false, error: 'Pedido de descanso inválido.' });
    try {
        emitResult(message, await applyApprovedRest(actor, requester, message.request));
    } catch (error) {
        emitResult(message, { ok: false, error: error?.message || 'Falha ao aplicar o descanso.' });
    }
}

function handleRestResponse(message) {
    if (message.recipientId !== game.user.id) return;
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingRequests.delete(message.requestId);
    message.ok ? pending.resolve(message) : pending.reject(new Error(message.error));
}

export function registerRestEngine() {
    game.socket.on(SOCKET_NAME, (message = {}) => {
        if (message.type === REQUEST_TYPE) void handleRestRequest(message);
        if (message.type === RESPONSE_TYPE) handleRestResponse(message);
    });
}

export async function openRestManager({ actorUuid } = {}) {
    if (!canvas.ready) return ui.notifications.warn('Canvas não pronto.');
    const actor = await resolveActor(actorUuid);
    if (!actor) return ui.notifications.warn('Não há personagem ativo.');
    if (!actor.isOwner && !game.user.isGM)
        return ui.notifications.error('Você não pode solicitar descanso para este personagem.');
    const request = await requestRestChoice(actor);
    if (!request) return null;
    const tier = resolveRestTier(request.requested, request.completedHours);
    if (!tier)
        return ui.notifications.warn('O descanso foi interrompido antes do benefício mínimo.');
    const gm = primaryActiveGm();
    if (!gm) return ui.notifications.error('Nenhum GM ativo para autorizar o descanso.');
    if (game.user.isGM && gm.id === game.user.id)
        return applyApprovedRest(actor, game.user, request);
    const requestId = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('O GM não respondeu ao pedido de descanso.'));
        }, REQUEST_TIMEOUT_MS);
        pendingRequests.set(requestId, { resolve, reject, timeoutId });
        game.socket.emit(SOCKET_NAME, {
            type: REQUEST_TYPE,
            requestId,
            requesterId: game.user.id,
            gmId: gm.id,
            actorUuid: actor.uuid,
            request,
        });
    });
}

export const REST_SLAYER_TYPES = RESTS;
