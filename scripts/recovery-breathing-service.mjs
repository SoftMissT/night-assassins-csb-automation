/**
 * @fileoverview Respiração da Recuperação: ações internas do próprio Slayer.
 *
 * Regra: `docs/Sistema/02 - Combate/Respirações de Suporte/Respiração da Recuperação.md`.
 * A conta fica em `recoveryOutcome` (pura, testável); o diálogo, os dados e o chat
 * ficam em `openRecoveryManager`.
 */
import { consumeSlayerActions } from './action-service.mjs';
import { parseNumber } from './parsing.mjs';
import { getRollStatusEffects } from './status-effects.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';

const FORMS = Object.freeze({
    coagulação: {
        label: '1ª Forma — Coagulação Forçada',
        action: 'especial',
        test: true,
        pdv: ['2d6', '3d6', '4d6', '5d6'],
        pdr: ['2d6', '3d6', '4d6', '5d6'],
        effect: 'Estanca Sangramento e Hemorragia.',
        removes: ['sangramento', 'hemorragia'],
    },
    expurgo: {
        label: '2ª Forma — Expurgo Térmico',
        action: 'especial',
        test: true,
        // PDV temporários (vão para `pdv_slayer_extra`), não cura.
        temporary: ['', '2d6', '3d6', '4d6'],
        pdr: ['', '2d6', '3d6', '4d6'],
        reteste: [0, 2, 4, 6],
        effect: 'PDV temporários, reteste contra Envenenamento ou Paralisia e remove Fadiga Espiritual.',
        removes: ['fadiga_espiritual'],
    },
    choque: {
        label: '3ª Forma — Choque Adrenérgico',
        action: 'reacao',
        test: false,
        pdr: ['2d6', '3d6', '4d6', '5d6'],
        rounds: [1, 1, 2, 2],
        effect: 'Ao chegar a 0 PDV, fica com 1 PDV e ignora a Exaustão por algumas rodadas.',
        removes: [],
    },
    sinfonia: {
        label: '4ª Forma — Sinfonia dos Pulmões',
        action: 'completa',
        test: true,
        pdv: ['', '', '6d8', '8d8'],
        pdr: ['', '', '6d8', '8d8'],
        attrMultiplier: 2,
        effect: 'Remove toda Exaustão e as Fadigas. Deixa Ofegante, passe ou não no teste.',
        removes: ['fadiga_corporal', 'fadiga_espiritual', 'fadiga_mental'],
    },
});

/** Dificuldade base do teste de FDV por Nível de Respiração. */
const DIFFICULTY = Object.freeze([14, 12, 10, 8]);

const n = (v) => Math.max(0, Math.trunc(parseNumber(v)));
const levelOf = (props) =>
    Math.min(
        4,
        Math.max(
            1,
            n(props.nvl_respiracao_num ?? props.respiracao_nivel ?? props.nivel_respiracao) || 1
        )
    );
const attr = (props, key) => n(props[`${key}_display`] ?? props[key]);

export function recoveryBreathingLevel(props = {}) {
    return levelOf(props);
}
/** Todo Slayer possui esta respiração; o nível da ficha define as Formas disponíveis. */
export function hasRecoveryBreathing(actor) {
    return actor?.type === 'slayer' || actor?.system?.props?.nvl_respiracao_num !== undefined;
}
export function recoveryFormDefinition(formId, level) {
    const form = FORMS[formId];
    if (!form) return null;
    const index = Math.min(4, Math.max(1, n(level) || 1)) - 1;
    return {
        ...form,
        formId,
        level: index + 1,
        dc: form.test ? DIFFICULTY[index] : 0,
        pdv: form.pdv?.[index] ?? '',
        temporary: form.temporary?.[index] ?? '',
        pdr: form.pdr?.[index] ?? '',
        reteste: form.reteste?.[index] ?? 0,
        rounds: form.rounds?.[index] ?? 0,
        attrMultiplier: form.attrMultiplier ?? 1,
        // Forma disponível no nível quando a tabela tem valor para ele.
        available: Boolean(form.pdr?.[index]),
    };
}

function currentResources(props) {
    const pdvMax = Math.max(
        0,
        n(props.pdv_slayer_total_conta) -
            n(props.pdv_slayer_dano_ferida) +
            n(props.pdv_slayer_extra)
    );
    const pdvRaw = pdvMax + n(props.pdv_slayer_curado) - n(props.pdv_slayer_dano_tomado);
    const pdv = Math.min(pdvMax, Math.max(0, pdvRaw));
    const pdrMax = Math.max(
        0,
        n(props.pdr_slayer_total_conta) +
            n(props.metal_slayer_pdr_bonus) +
            n(props.pdr_slayer_extra)
    );
    const pdr = Math.min(
        pdrMax,
        Math.max(0, pdrMax + n(props.pdr_slayer_curado) - n(props.pdr_slayer_gasto_valor))
    );
    return { pdvMax, pdvRaw, pdv, pdrMax, pdr };
}

/**
 * Resultado de uma Forma já rolada: patch da ficha e linhas do resumo.
 * @param {object} args
 * @param {string} args.formId
 * @param {object} args.props
 * @param {boolean} args.success passou no teste de FDV (Choque não tem teste)
 * @param {number} [args.pdvRoll] total rolado de PDV (cura ou temporário)
 * @param {number} [args.pdrRoll] total rolado de PDR
 * @param {boolean} [args.naturalTwenty]
 * @param {string[]} [args.alsoRemove] status removidos por fora (reteste do Expurgo)
 */
export function recoveryOutcome({
    formId,
    props = {},
    success,
    pdvRoll = 0,
    pdrRoll = 0,
    naturalTwenty = false,
    alsoRemove = [],
}) {
    const level = levelOf(props);
    const def = recoveryFormDefinition(formId, level);
    const status = parseStatusState(props.status_slayer_dados);
    const resources = currentResources(props);
    const patch = {};
    const summary = [];
    let exhaustion = Math.max(status.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
    let active = [...status.active];
    const effects = { ...status.effects };
    const remove = (keys) => {
        const gone = active.filter((key) => keys.includes(key));
        active = active.filter((key) => !keys.includes(key));
        for (const key of gone) delete effects[key];
        return gone;
    };

    if (success) {
        // Fadiga Espiritual (antes da Forma) corta pela metade o PDR recuperado.
        const halved = status.active.includes('fadiga_espiritual');
        let pdrGain = pdrRoll + (naturalTwenty ? 2 * level : 0);
        if (halved) pdrGain = Math.floor(pdrGain / 2);
        const pdrApplied = Math.min(Math.max(0, resources.pdrMax - resources.pdr), pdrGain);
        if (pdrApplied > 0) {
            patch['system.props.pdr_slayer_curado'] = n(props.pdr_slayer_curado) + pdrApplied;
            summary.push(`+${pdrApplied} PDR${halved ? ' (metade, Fadiga Espiritual)' : ''}`);
        }
        if (def.temporary) {
            // PDV temporário não acumula: fica o maior.
            const current = n(props.pdv_slayer_extra);
            if (pdvRoll > current) patch['system.props.pdv_slayer_extra'] = pdvRoll;
            summary.push(`${Math.max(current, pdvRoll)} PDV temporários`);
        } else if (formId === 'choque') {
            // Fica com exatamente 1 PDV, mesmo que o dano tenha passado do zero.
            const curado = n(props.pdv_slayer_curado);
            patch['system.props.pdv_slayer_curado'] = curado + (1 - resources.pdvRaw);
            summary.push('fica com 1 PDV');
        } else if (def.pdv) {
            const pdvApplied = Math.min(Math.max(0, resources.pdvMax - resources.pdv), pdvRoll);
            if (pdvApplied > 0) {
                patch['system.props.pdv_slayer_curado'] = n(props.pdv_slayer_curado) + pdvApplied;
                summary.push(`+${pdvApplied} PDV`);
            }
        }
        const removed = remove([...def.removes, ...alsoRemove]);
        if (removed.length) summary.push(`remove ${removed.join(', ')}`);
        if (formId === 'sinfonia' && exhaustion > 0) {
            summary.push(`Exaustão ${exhaustion} → 0`);
            exhaustion = 0;
            patch['system.props.status_slayer_exaustao'] = 0;
        }
        if (formId === 'choque') {
            if (!active.includes('choque_adrenergico')) active.push('choque_adrenergico');
            effects.choque_adrenergico = {
                remainingTurns: def.rounds,
                sourceName: 'Respiração da Recuperação',
                tick: 'start',
            };
            summary.push(`ignora Exaustão por ${def.rounds} ${def.rounds === 1 ? 'rodada' : 'rodadas'}`);
        }
    } else summary.push('falhou: sem efeito, a ação foi gasta');

    if (formId === 'sinfonia' && !active.includes('ofegante')) {
        active.push('ofegante');
        summary.push('fica Ofegante');
    }
    patch['system.props.status_slayer_dados'] = JSON.stringify({
        ...status,
        active,
        exhaustion,
        effects: Object.fromEntries(Object.entries(effects).filter(([key]) => active.includes(key))),
    });
    patch['system.props.status_slayer_resumo'] = formatStatusSummary(active, exhaustion);
    return { patch, summary, def };
}

async function rollFormula(formula, actor, flavor) {
    if (!formula) return 0;
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
    return n(roll.total);
}

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

/**
 * Reteste do Expurgo Térmico contra Envenenamento ou Paralisia, com o bônus do nível.
 * Usa a CD guardada no status; sem ela, pergunta. Devolve os status vencidos.
 */
async function expurgoRetest(actor, props, bonus) {
    const status = parseStatusState(props.status_slayer_dados);
    const targets = ['envenenamento', 'paralisia'].filter((key) => status.active.includes(key));
    if (!targets.length) return [];
    const labels = { envenenamento: 'Envenenamento', paralisia: 'Paralisia' };
    const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Expurgo Térmico — reteste' },
        modal: true,
        rejectClose: false,
        content: `<p>Repetir o teste contra qual status? Bônus +${bonus}.</p>
            <select name="status">${targets.map((key) => `<option value="${key}">${labels[key]}</option>`).join('')}</select>
            <label style="display:block;margin-top:8px">CD (vazio usa a do status)
              <input type="number" name="dc" min="1" max="99" value="${status.effects[targets[0]]?.saveDc || ''}"></label>`,
        buttons: [
            {
                action: 'roll',
                label: 'Rolar reteste',
                default: true,
                callback: (_e, b) => ({
                    key: b.form.elements.status.value,
                    dc: Number(b.form.elements.dc.value) || 0,
                }),
            },
            { action: 'skip', label: 'Sem reteste', callback: () => null },
        ],
    });
    if (!chosen) return [];
    const effect = status.effects[chosen.key] ?? {};
    const dc = chosen.dc || effect.saveDc || 0;
    if (dc <= 0) {
        ui.notifications.warn('Sem CD: o reteste não foi rolado.');
        return [];
    }
    const saveAttr = effect.saveAttr || 'VIT';
    // A passiva Autocontrole Celular dá Vantagem em VIT contra Envenenamento.
    const mode = getRollStatusEffects(props, { test: 'Resistência', attr: saveAttr }).mode;
    const dice = mode === 'advantage' ? '2d20kh1' : mode === 'disadvantage' ? '2d20kl1' : '1d20';
    const roll = await new Roll(`${dice} + ${attr(props, saveAttr.toLowerCase())} + ${bonus}`).evaluate();
    const passed = n(roll.total) >= dc;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>Expurgo Térmico</strong> — reteste contra ${labels[chosen.key]} (${saveAttr} +${bonus}, CD ${dc}): ${passed ? 'Sucesso' : 'Falha'}`,
    });
    return passed ? [chosen.key] : [];
}

export async function openRecoveryManager({ actorUuid } = {}) {
    const doc = actorUuid ? await fromUuid(actorUuid) : null;
    const actor =
        doc?.actor ??
        doc ??
        (canvas?.ready ? canvas.tokens.controlled[0]?.actor : null) ??
        game.user?.character;
    if (!actor) return ui.notifications.warn('Nenhum personagem ativo.');
    if (!actor.isOwner && !game.user.isGM)
        return ui.notifications.error('Você não pode usar esta Respiração.');
    const props = actor.system?.props ?? {};
    const level = levelOf(props);
    const status = parseStatusState(props.status_slayer_dados);
    const atZero = currentResources(props).pdv <= 0;
    const options = Object.keys(FORMS)
        .map((formId) => recoveryFormDefinition(formId, level))
        .filter((def) => def.available && (def.formId !== 'choque' || atZero))
        .map(
            (def) =>
                `<option value="${def.formId}">${escapeHtml(def.label)}${def.test ? ` (FDV CD ${def.dc})` : ' (sem teste)'}</option>`
        );
    if (status.active.includes('ofegante'))
        options.push('<option value="recuperar_folego">Recuperar o fôlego (remove Ofegante, Ação Especial)</option>');
    const hint = atZero ? '' : '<p class="hint">Choque Adrenérgico só aparece com o personagem em 0 PDV.</p>';
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Respiração da Recuperação' },
        modal: true,
        rejectClose: false,
        content: `<p>Nível ${level}. As Formas custam 0 PDR.</p><select name="form">${options.join('')}</select>${hint}`,
        buttons: [
            { action: 'use', label: 'Usar', default: true, callback: (_e, b) => b.form.elements.form.value },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!result) return null;

    if (result === 'recuperar_folego') {
        const action = await consumeSlayerActions(actor, ['especial']);
        if (!action.ok) return ui.notifications.warn(action.reason);
        const active = status.active.filter((key) => key !== 'ofegante');
        const patch = {
            'system.props.status_slayer_dados': JSON.stringify({ ...status, active }),
            'system.props.status_slayer_resumo': formatStatusSummary(active, status.exhaustion),
        };
        await actor.update(patch, { naCsbAutomation: true, naBreathing: true });
        return { ok: true, form: result, success: true, patch };
    }

    const def = recoveryFormDefinition(result, level);
    if (!def?.available) return ui.notifications.warn('Esta Forma não está disponível neste nível.');
    if (result === 'choque' && !atZero)
        return ui.notifications.warn('Choque Adrenérgico só pode ser usado ao chegar a 0 PDV.');
    const action = await consumeSlayerActions(actor, [def.action]);
    if (!action.ok) return ui.notifications.warn(action.reason);

    let success = true;
    let naturalTwenty = false;
    if (def.test) {
        const roll = await new Roll(`1d20 + ${attr(props, 'fdv')}`).evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${def.label} — FDV CD ${def.dc}`,
        });
        naturalTwenty = (roll.dice?.[0]?.results?.[0]?.result ?? 0) === 20;
        success = n(roll.total) >= def.dc || naturalTwenty;
    }
    let pdvRoll = 0;
    let pdrRoll = 0;
    let alsoRemove = [];
    if (success) {
        const vit = attr(props, 'vit') * def.attrMultiplier;
        const fdv = attr(props, 'fdv') * def.attrMultiplier;
        const pdvFormula = def.pdv || def.temporary;
        pdvRoll = await rollFormula(
            pdvFormula ? `${pdvFormula} + ${vit}` : '',
            actor,
            `${def.label} — ${def.temporary ? 'PDV temporários' : 'recuperação de PDV'}`
        );
        pdrRoll = await rollFormula(def.pdr ? `${def.pdr} + ${fdv}` : '', actor, `${def.label} — recuperação de PDR`);
        if (result === 'expurgo') alsoRemove = await expurgoRetest(actor, props, def.reteste);
    }
    const outcome = recoveryOutcome({ formId: result, props, success, pdvRoll, pdrRoll, naturalTwenty, alsoRemove });
    await actor.update(outcome.patch, { naCsbAutomation: true, naBreathing: true });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${escapeHtml(def.label)}</strong>${naturalTwenty ? ' — 20 natural' : ''}: ${escapeHtml(outcome.summary.join('; '))}.</p>`,
    });
    return { ok: true, form: result, success, patch: outcome.patch };
}

export { FORMS as RECOVERY_FORMS };
