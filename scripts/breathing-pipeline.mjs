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

const ATTACK_LIKE_ACTIONS = new Set(['ataque', 'especial', 'unica', 'completa']);

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
} = {}) {
    const notify = runtime?.notify;
    if (!actor || !runtime) return { ok: false, reason: 'Pipeline canônico sem actor ou runtime.' };

    const form = resolveForm(respiracao, formaId);
    if (!form) return refusal(notify, `Forma desconhecida: ${formaId ?? ''}.`);

    const resolved = resolveLevel(form, level);
    if (!resolved.ok) return refusal(notify, resolved.reason);
    const dados = resolved.dados;

    const breathLevel = Math.max(1, Math.trunc(Number(runtime.getBreathLevel?.()) || 1));
    if (level > breathLevel)
        return refusal(notify, `Requer Nível de Respiração ${level}. Atual: ${breathLevel}.`);

    const custo = Math.max(0, Math.trunc(Number(dados.custo) || 0));
    const surcharge = Math.max(0, Math.trunc(Number(runtime.getPdrSurcharge?.()) || 0));
    const custoTotal = custo + surcharge;
    const pdrCurrent = Math.max(0, Math.trunc(Number(runtime.getPdrCurrent?.()) || 0));
    if (custoTotal > pdrCurrent)
        return refusal(
            notify,
            `PDR insuficiente! Disponível: ${pdrCurrent}, necessário: ${custoTotal}.`
        );

    const acoes = (Array.isArray(form.acoes) ? form.acoes : []).filter(Boolean);
    const patch = {};
    if (acoes.length > 0) {
        const actionResult = await runtime.consumeActions?.(actor, acoes);
        if (!actionResult?.ok)
            return refusal(notify, actionResult?.reason ?? 'Ação indisponível.');
        Object.assign(patch, actionResult.patch ?? {});
    }
    if (custoTotal > 0) {
        const props = runtime.getProps?.(actor) ?? {};
        patch['system.props.pdr_slayer_gasto_valor'] =
            Math.max(0, Math.trunc(Number(props.pdr_slayer_gasto_valor) || 0)) + custoTotal;
    }
    // Consumo só depois da decisão de uso: cancelar o diálogo de Acerto não
    // paga ação, PDR nem feeds (o legado estornava via rollbackPatch).
    const commit = async () => {
        if (surcharge > 0)
            notify?.info?.(
                `Fadiga Espiritual: +${surcharge} PDR (custo total: ${custoTotal}).`
            );
        if (typeof runtime.applyFeeds === 'function')
            await runtime.applyFeeds(actor, form.feedsUsar, 'usar');
        await runtime.applyPatch?.(actor, patch);
    };

    const attackLike = ATTACK_LIKE_ACTIONS.has(form.acao);
    const entradas = Array.from({ length: attackCount(dados.primitivas) }, () => ({
        tipoAcao: form.acao ?? 'ataque',
        dado: dados.dano,
        fixo: 0,
        attrs: [],
        tiposDano: Array.isArray(dados.tiposDano) ? dados.tiposDano : [],
    }));
    const tecnica = form.ptName || form.nome || form.id;

    let attackHits = 0;
    if (dados.dano && attackLike && !form.semAcerto) {
        const hit = await runtime.rollHit?.({
            actor,
            autoDamage: false,
            forceActionType: form.acao,
        });
        if (hit === null || hit === undefined) return { ok: false, reason: 'Acerto cancelado.' };
        await commit();
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
                entradas: [
                    ...(Array.isArray(weaponEntries) ? weaponEntries : []),
                    ...entradas,
                ],
                skipActionConsumption: true,
                forceAttackDamage: true,
                skipBreathingInjection: true,
            });
        }
    } else if (dados.dano && (form.semAcerto || !attackLike)) {
        await commit();
        await runtime.rollDamage?.({
            actor,
            nome: tecnica,
            breathing: form.respiracao,
            entradas,
            skipActionConsumption: true,
            forceAttackDamage: true,
            skipBreathingInjection: true,
        });
    } else {
        await commit();
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

    await runtime.postUsage?.({ actor, form, level, custo: custoTotal, dados });
    return { ok: true };
}
