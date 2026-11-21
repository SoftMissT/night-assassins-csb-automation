/**
 * @fileoverview Continuação compartilhada pós-Acerto.
 *
 * Depois que um Acerto é confirmado (arma pura OU Forma de Respiração), o
 * jogador precisa de duas coisas que o pipeline antigo não fazia sozinho:
 *   1. a chance de encadear outra Forma ANTES do dano ser rolado (o estado
 *      pendente de Respiração combos como o rider da 1ª Forma das Chamas —
 *      só sobrevive se o dano não for resolvido no meio do caminho);
 *   2. se não for encadear, o dano precisa disparar sozinho usando a arma
 *      selecionada no diálogo de Acerto ou, quando a própria técnica não tem
 *      dado de dano próprio (ex.: 2ª Forma das Chamas, que só concede
 *      crítico) e nenhuma arma foi escolhida, a única arma equipada do
 *      Actor. O dano da arma nunca deve ficar de fora quando a técnica
 *      depende dele só é ignorado quando a fonte explicitamente substitui
 *      (ex.: Colapso da Névoa com `replaceWeaponDamage`, tratado dentro de
 *      damage-service.mjs).
 *
 * Usado por hit-service.mjs (ataques de arma "crus") e por
 * breath-service.mjs (Formas de Respiração) mesmo padrão, sem duplicar
 * lógica em dois lugares.
 */
import { actorWeapons, isPassiveItem } from './breath-passives.mjs';
import { actorKind } from './actor-kind.mjs';
import { formsForActorBreathings, secondaryBreathingUse } from './slayer/dual-breathing-service.mjs';
import { parseLevel, parseNumber } from './parsing.mjs';
import { oniUnarmedProfile } from './oni/progression-service.mjs';

export function canChainBreathForms(actor) {
    const kind = actorKind(actor);
    if (kind !== 'oni') return true;
    const origin = String(actor?.system?.props?.origem_oni_dropdown ?? '').trim();
    return origin === 'origem_oni_exterminador_corrompido' || origin === 'exterior_corrompido';
}

/**
 * Lista as Formas de Respiração do Actor que podem ser encadeadas após um
 * Acerto confirmado (exclui a Forma de origem, quando informada, e
 * passivas automáticas que não se "usam" no sentido de uma técnica).
 */
export function listChainableBreathForms(actor, { excludeItemUuid = '' } = {}) {
    const source = formsForActorBreathings([...(actor?.items ?? [])], actor);
    return source
        .filter((item) => {
            if (item.uuid === excludeItemUuid) return false;
            const props = item.system?.props ?? {};
            if (!(props.forma_id && props.respiracao_nome)) return false;
            if (Number(props.forma_passiva) === 1) return false;
            if (isPassiveItem(String(props.forma_id))) return false;
            const secondary = secondaryBreathingUse(actor, props.respiracao_nome);
            return !secondary || (secondary.ok && secondary.level >= parseNumber(props.nivel_req));
        })
        .map((item) => {
            const props = item.system?.props ?? {};
            return {
                uuid: item.uuid,
                label: `${props.respiracao_nome ?? 'Respiração'} ${props.nome_forma ?? item.name}`,
            };
        });
}

/**
 * Pergunta ao jogador se ele quer encadear outra Forma antes de rolar o
 * dano deste Acerto confirmado. "Sim" abre a seleção de Forma e delega ao
 * lançador universal (`useBreathForm`, que resolve seu próprio Acerto/dano
 * incluindo, recursivamente, sua própria pergunta de encadeamento).
 * "Não" (ou diálogo fechado/sem Formas disponíveis) nunca trava o fluxo —
 * o chamador segue para o dano normalmente.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string} [options.excludeItemUuid] - Forma de origem, para não se oferecer a si mesma.
 * @returns {Promise<boolean>} true se o jogador optou por encadear nesse
 * caso o chamador NÃO deve rolar o dano agora; a Forma encadeada já
 * resolveu (ou está resolvendo) o próprio dano.
 */
export async function confirmChainedForma(actor, { excludeItemUuid = '' } = {}) {
    if (!canChainBreathForms(actor)) return false;
    const { openChainFormDialog } = await import('./dialogs/hit-dialog.mjs');
    const chainable = listChainableBreathForms(actor, { excludeItemUuid });
    const decision = await openChainFormDialog({ chainable });
    if (decision?.chain && decision.itemUuid) {
        const { useBreathForm } = await import('./breath-service.mjs');
        const result = await useBreathForm({ actorUuid: actor.uuid, itemUuid: decision.itemUuid });
        return result?.ok === true;
    }
    return false;
}

/**
 * Resolve o dano de um Acerto já confirmado.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {{attempts:Array<{hit:boolean,critical:boolean}>, weapon?:{id:string,profileIndex?:number}}} options.hitResult
 * @param {string} [options.techniqueLabel] - nome exibido no chat de dano.
 * @param {Array} [options.techniqueEntradas] - entradas de dano próprias da técnica (ex.: pendingDamage das Respirações). Vazio quando a técnica não tem dado próprio.
 * @param {boolean} [options.forceAttackDamage]
 * @param {boolean} [options.skipBreathingInjection]
 * @returns {Promise<void>}
 */
export async function resolveAutoDamage({
    actor,
    hitResult,
    techniqueLabel = 'Ataque',
    breathing = '',
    techniqueEntradas = [],
    forceAttackDamage = true,
    skipBreathingInjection = false,
    classBasicAttack = false,
    passivePlan = null,
    targets,
}) {
    const successful = (hitResult?.attempts ?? []).filter((attempt) => attempt.hit);
    if (successful.length === 0) return;

    const { rollDamage, rollWeaponItem } = await import('./damage-service.mjs');

    let weaponItem = hitResult.weapon?.id ? actor.items?.get?.(hitResult.weapon.id) : null;
    let weaponProfileIndex = hitResult.weapon?.profileIndex ?? 0;

    // Fallback: técnica sem dado de dano próprio + nenhuma arma escolhida no
    // diálogo de Acerto + Actor com exatamente UMA arma distinta equipada.
    // Só assume a arma quando não há ambiguidade com múltiplas armas
    // diferentes, o jogador precisa escolher explicitamente no diálogo.
    if (!weaponItem && techniqueEntradas.length === 0 && !hitResult.oniUnarmed) {
        const weapons = actorWeapons(actor);
        const distinctIds = [...new Set(weapons.map((entry) => entry.id))];
        if (distinctIds.length === 1) {
            const fallback = weapons[0];
            weaponItem = actor.items?.get?.(fallback.id) ?? null;
            weaponProfileIndex = fallback.profileIndex ?? 0;
        }
    }

    const actionId =
        globalThis.foundry?.utils?.randomID?.() ??
        globalThis.crypto?.randomUUID?.() ??
        String(Date.now());
    const deferWindDamageDealt = successful.length > 1 && hitResult.formId?.startsWith('vento_');
    const oniTitanImpactEligible = classBasicAttack && hitResult.actionType === 'ataque' && hitResult.isTechnique !== true;
    const oniProps = actor.system?.props ?? {};
    const unarmed = hitResult.oniUnarmed ? oniUnarmedProfile(parseLevel(oniProps.nvl_oni ?? oniProps.nvl_num ?? oniProps.nvl_pj),
        hitResult.attackAttribute === 'DEX' ? 'claw' : 'martial') : null;
    let windDamageDealt = 0;
    for (const attempt of successful) {
        let result;
        if (weaponItem && !(passivePlan && techniqueEntradas.length)) {
            result = await rollWeaponItem({
                actor,
                item: weaponItem,
                weaponProfileIndex,
                critical: attempt.critical,
                attackTotal: attempt.roll?.total,
                actionId,
                skipActionConsumption: true,
                forceAttackDamage,
                damageOnly: true,
                weaponAttackIndex: Number.isInteger(attempt.attackIndex) ? attempt.attackIndex : 0,
                classBasicAttack,
                oniTitanImpactEligible,
                passiveExecutionId: hitResult.executionId,
                passiveFormId: hitResult.formId,
                deferWindDamageDealt,
                passivePlan,
                targets,
                ...(attempt.flamingUniverse ? { flamingUniverse: attempt.flamingUniverse } : {}),
            });
        } else {
            const entradas =
                techniqueEntradas.length > 0
                    ? techniqueEntradas
                    : unarmed
                      ? [{ tipoAcao: 'ataque', dado: unarmed.formula.replace(/\b(DEX|FOR)\b/, '@$1'),
                          fixo: 0, attrs: [], tiposDano: [unarmed.attribute === 'DEX' ? 'cortante' : 'concussao'] }]
                      : [{ tipoAcao: 'ataque', dado: '', fixo: 0, attrs: [], tiposDano: [] }];
            result = await rollDamage({
                actor,
                nome: techniqueLabel,
                breathing,
                entradas,
                critical: attempt.critical,
                attackTotal: attempt.roll?.total,
                actionId,
                skipActionConsumption: true,
                forceAttackDamage,
                skipBreathingInjection: skipBreathingInjection || techniqueEntradas.length > 0,
                classBasicAttack,
                oniTitanImpactEligible,
                oniToxicUnarmedCritical: Boolean(unarmed && attempt.critical),
                passiveExecutionId: hitResult.executionId,
                passiveFormId: hitResult.formId,
                deferWindDamageDealt,
                passivePlan,
                targets,
            });
        }
        windDamageDealt += Number(result?.windDamageDealt) || 0;
    }
    if (deferWindDamageDealt && windDamageDealt > 0) {
        const { recordBreathingPassiveEvent } = await import('./breathing-combat-passives.mjs');
        await recordBreathingPassiveEvent(actor, { type: 'damageDealt', formId: hitResult.formId,
            executionId: hitResult.executionId, isTechnique: true, direct: true, hostile: true, amount: windDamageDealt });
    }
}
