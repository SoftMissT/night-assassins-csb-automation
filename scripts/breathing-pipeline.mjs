/**
 * @fileoverview Pipeline canônico de uso de Forma de Respiração.
 *
 * Forma é dado: este módulo executa o fluxo único (valida → consome ação/PDR
 * → feeds → acerto/dano → primitivas → chat) para qualquer Respiração
 * migrada, sem conhecer nenhuma pelo nome. Sem imports estáticos de
 * breath-service/hit-service/damage-service (evita ciclo) — tudo entra pelo
 * `runtime` injetado; os testes injetam um fake.
 */

import { resolveForm, resolveLevel } from './breathing-contract.mjs';
import { attackCount, runLevelPrimitives } from './breathing-primitives.mjs';
import { breathingResourceKeys } from './actor-resources.mjs';

const ATTACK_LIKE_ACTIONS = new Set(['ataque', 'especial', 'unica', 'completa']);
const activeAttackSequences = new WeakSet();

function refusal(notify, reason) {
    notify?.warn?.(reason);
    return { ok: false, reason };
}

/**
 * Executa uma Forma canônica do início ao fim.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} options.respiracao - nome da Respiração (ex.: 'Pedra').
 * @param {string} options.formaId - `forma_id` do item (resolvido pelo contrato).
 * @param {number} options.level - Nível de Respiração escolhido (1–4).
 * @param {object} options.runtime - runtime injetado (notify, consumeActions,
 *   applyPatch, getProps, getPdrCurrent, getBreathLevel, resolveCardTargets,
 *   rollHit, rollDamage, resolveAutoDamage, postUsage, …).
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function runCanonicalBreathingForm({
    actor,
    respiracao,
    formaId,
    level,
    runtime,
    damageOverride = null,
    displayName,
} = {}) {
    const notify = runtime?.notify;
    if (!actor || !runtime) return { ok: false, reason: 'Pipeline canônico sem actor ou runtime.' };

    const form = resolveForm(respiracao, formaId);
    if (!form) return refusal(notify, `Forma desconhecida: ${formaId ?? ''}.`);

    const resolved = resolveLevel(form, level);
    if (!resolved.ok) return refusal(notify, resolved.reason);
    // Dano escolhido pelo jogador (guardado no Item) substitui só o dano base da Forma.
    const dados =
        damageOverride && resolved.dados.dano
            ? { ...resolved.dados, dano: damageOverride }
            : resolved.dados;
    const missLimit = dados.primitivas.find((entry) => entry.tipo === 'sequenciaAteErros')?.limite;
    const totalAttacks = attackCount(dados.primitivas);
    const criticalPdrRefund = dados.primitivas.find((entry) => entry.tipo === 'ataques')?.pdrNoCritico ?? 0;
    const buff = dados.primitivas.find((entry) => entry.tipo === 'buff');

    const breathLevel = Math.max(1, Math.trunc(Number(runtime.getBreathLevel?.()) || 1));
    if (level > breathLevel)
        return refusal(notify, `Requer Nível de Respiração ${level}. Atual: ${breathLevel}.`);
    const buffError = buff ? runtime.checkBuff?.(actor, buff) : '';
    if (buffError) return refusal(notify, buffError);

    const custo = Math.max(0, Math.trunc(Number(dados.custo) || 0));
    const surcharge = Math.max(0, Math.trunc(Number(runtime.getPdrSurcharge?.()) || 0));
    const secondary = runtime.getSecondaryUse?.();
    if (secondary && !secondary.ok) return refusal(notify, secondary.reason);
    const custoTotal = custo + surcharge + (secondary?.cost.pdr ?? 0);
    const pdrCurrent = Math.max(0, Math.trunc(Number(runtime.getPdrCurrent?.()) || 0));
    if (custoTotal > pdrCurrent)
        return refusal(
            notify,
            `PDR insuficiente! Disponível: ${pdrCurrent}, necessário: ${custoTotal}.`
        );

    const acoes = (Array.isArray(form.acoes) ? form.acoes : []).filter(Boolean);
    const postureActions = acoes.length ? acoes : [form.acao].filter(Boolean);
    let postureUse = runtime.getPostureUse?.(postureActions, custoTotal, secondary?.cost.pdv);
    if (postureUse && !postureUse.ok) return refusal(notify, postureUse.reason);
    const patch = {};
    if (acoes.length > 0) {
        const actionResult = await runtime.consumeActions?.(actor, acoes);
        if (!actionResult?.ok) return refusal(notify, actionResult?.reason ?? 'Ação indisponível.');
        Object.assign(patch, actionResult.patch ?? {});
    }
    const applyResourcePatch = () => {
        if (custoTotal === 0) return;
        const props = runtime.getProps?.(actor) ?? {};
        const spentKey = runtime.pdrSpentKey ?? 'pdr_slayer_gasto_valor';
        patch[`system.props.${spentKey}`] =
            Math.max(0, Math.trunc(Number(props[spentKey]) || 0)) + custoTotal;
    };
    if (!secondary && !missLimit && totalAttacks === 1) applyResourcePatch();
    // Consumo só depois da decisão de uso: cancelar o diálogo de Acerto não
    // paga ação, PDR nem feeds (o legado estornava via rollbackPatch).
    const commit = async () => {
        postureUse = runtime.getPostureUse?.(postureActions, custoTotal, secondary?.cost.pdv);
        if (postureUse && !postureUse.ok) return refusal(notify, postureUse.reason);
        if (secondary || postureUse || missLimit || totalAttacks > 1) {
            const latest = secondary ? runtime.getSecondaryUse() : null;
            if (latest && !latest.ok) return refusal(notify, latest.reason);
            if (custoTotal > runtime.getPdrCurrent())
                return refusal(notify, `PDR insuficiente! Necessário: ${custoTotal}.`);
            if (acoes.length) {
                const currentAction = await runtime.consumeActions(actor, acoes);
                if (!currentAction?.ok) return refusal(notify, currentAction?.reason ?? 'Ação indisponível.');
                Object.assign(patch, currentAction.patch ?? {});
            }
            Object.assign(patch, latest?.patch);
            applyResourcePatch();
        }
        Object.assign(patch, postureUse?.patch);
        if (surcharge > 0)
            notify?.info?.(`Fadiga Espiritual: +${surcharge} PDR (custo total: ${custoTotal}).`);
        if (typeof runtime.applyFeeds === 'function')
            await runtime.applyFeeds(actor, form.feedsUsar, 'usar');
        await runtime.applyPatch?.(actor, patch);
        return { ok: true };
    };

    const attackLike = ATTACK_LIKE_ACTIONS.has(form.acao);
    const entradas = [{
        tipoAcao: form.acao ?? 'ataque',
        dado: dados.dano,
        fixo: 0,
        attrs: [],
        tiposDano: Array.isArray(dados.tiposDano) ? dados.tiposDano : [],
    }];
    const tecnica = displayName || form.ptName || form.nome || form.id;

    let attackHits = 0;
    if (missLimit) {
        if (activeAttackSequences.has(actor)) return refusal(notify, 'Já existe uma sequência de Acerto em andamento.');
        activeAttackSequences.add(actor);
        let activation;
        try {
            const hit = await runtime.rollHit?.({
                actor,
                autoDamage: false,
                skipActionConsumption: true,
                forceActionType: form.acao,
                isTechnique: true,
                formId: form.id,
                attackSequence: {
                    missLimit,
                    beforeFirstRoll: async () => {
                        activation = await commit();
                        return activation.ok;
                    },
                    onHit: ({ attempt, executionId }) => runtime.rollDamage?.({
                        actor,
                        nome: tecnica,
                        breathing: form.respiracao,
                        entradas,
                        critical: attempt.critical,
                        attackTotal: attempt.roll.total,
                        skipActionConsumption: true,
                        forceAttackDamage: true,
                        skipBreathingInjection: true,
                        passiveExecutionId: executionId,
                        passiveFormId: form.id,
                    }),
                },
            });
            attackHits = hit?.hits ?? 0;
        } finally {
            activeAttackSequences.delete(actor);
        }
        if (!activation?.ok) return activation ?? { ok: false, reason: 'Acerto cancelado.' };
    } else if (totalAttacks > 1 && dados.dano && attackLike && !form.semAcerto) {
        let refunded = false;
        for (let index = 0; index < totalAttacks; index += 1) {
            const actionType = acoes[index] ?? form.acao;
            const hit = await runtime.rollHit?.({
                actor,
                autoDamage: false,
                skipActionConsumption: true,
                forceActionType: actionType,
                forceRollCount: 1,
                isTechnique: true,
                formId: form.id,
            });
            const attempt = hit?.attempts?.[0];
            if (!attempt) {
                if (index === 0) return { ok: false, reason: 'Acerto cancelado.' };
                break;
            }
            if (index === 0) {
                const committed = await commit();
                if (!committed.ok) return committed;
            }
            if (!attempt.hit) continue;
            attackHits += 1;
            if (!refunded && attempt.critical && criticalPdrRefund > 0) {
                const props = runtime.getProps?.(actor) ?? {};
                const { pdrRecovered } = breathingResourceKeys(props);
                const recovered = Math.max(0, Number(props[pdrRecovered]) || 0);
                await runtime.applyPatch?.(actor, {
                    [`system.props.${pdrRecovered}`]: recovered + Math.min(custo, criticalPdrRefund),
                });
                refunded = true;
            }
            await runtime.rollDamage?.({
                actor,
                nome: tecnica,
                breathing: form.respiracao,
                entradas: [{ ...entradas[0], tipoAcao: actionType }],
                critical: attempt.critical,
                attackTotal: attempt.roll?.total,
                skipActionConsumption: true,
                forceAttackDamage: true,
                skipBreathingInjection: true,
                actionId: hit.executionId,
                passiveExecutionId: hit.executionId,
                passiveFormId: form.id,
            });
        }
    } else if (dados.dano && attackLike && !form.semAcerto) {
        const hit = await runtime.rollHit?.({
            actor,
            autoDamage: false,
            skipActionConsumption: true,
            forceActionType: form.acao,
            isTechnique: true,
            formId: form.id,
        });
        if (hit === null || hit === undefined) return { ok: false, reason: 'Acerto cancelado.' };
        const committed = await commit();
        if (!committed.ok) return committed;
        attackHits = Math.max(0, Math.trunc(Number(hit?.hits) || 0));
        if (attackHits > 0) {
            // Arma escolhida no Acerto + dano da técnica na MESMA rolagem —
            // o dano da Forma não pode se perder quando há arma no diálogo.
            const weaponEntries =
                hit.weapon?.id && typeof runtime.weaponEntriesFor === 'function'
                    ? await runtime.weaponEntriesFor(actor, hit.weapon)
                    : [];
            await runtime.rollDamage?.({
                actor,
                nome: tecnica,
                breathing: form.respiracao,
                entradas: [...(Array.isArray(weaponEntries) ? weaponEntries : []), ...entradas],
                skipActionConsumption: true,
                forceAttackDamage: true,
                skipBreathingInjection: true,
                passiveExecutionId: hit.executionId,
                passiveFormId: form.id,
            });
        }
    } else if (dados.dano && (form.semAcerto || !attackLike)) {
        const committed = await commit();
        if (!committed.ok) return committed;
        await runtime.rollDamage?.({
            actor,
            nome: tecnica,
            breathing: form.respiracao,
            entradas,
            skipActionConsumption: true,
            forceAttackDamage: true,
            skipBreathingInjection: true,
            passiveFormId: form.id,
        });
    } else {
        const committed = await commit();
        if (!committed.ok) return committed;
    }

    const primitivesRun = attackLike && !form.semAcerto ? attackHits > 0 : true;
    if (primitivesRun) {
        const targets = runtime.resolveCardTargets?.() ?? [];
        await runLevelPrimitives({
            primitives: dados.primitivas,
            actor,
            targets: Array.isArray(targets) ? targets : [],
            runtime,
        });
    }

    await runtime.postUsage?.({ actor, form, level, custo: custoTotal,
        pdv: (secondary?.cost.pdv ?? 0) + (postureUse?.extraPdv ?? 0), dados, displayName });
    return { ok: true };
}
