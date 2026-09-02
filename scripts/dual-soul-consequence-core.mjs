/**
 * @fileoverview
 * State machine puro das consequências de uma falha
 * no Teste de Resistência ao Despertar.
 *
 * Entrada:
 *   runtime v0.11.64 com:
 *   pending=true
 *   result=failure
 *   challengerKind=entidade|demonio
 *
 * O Core NÃO:
 * - rerrola;
 * - lê Equilíbrio;
 * - lê Cerimônia;
 * - conhece armas;
 * - conhece espíritos nominais.
 */

export const DUAL_SOUL_CONSEQUENCE_VERSION = 1;

const CHALLENGERS =
    Object.freeze([
        'entidade',
        'demonio',
    ]);

function clonePlain(
    value
) {
    return JSON.parse(
        JSON.stringify(
            value ?? {}
        )
    );
}

function normalizeKind(
    value
) {
    const normalized =
        String(value ?? '')
            .trim()
            .toLocaleLowerCase('pt-BR')
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/gu,
                ''
            );

    if (
        normalized === 'entidade'
    ) {
        return 'entidade';
    }

    if (
        normalized === 'demonio'
    ) {
        return 'demonio';
    }

    return null;
}

function originalResistanceSnapshot(
    runtime
) {
    const snapshot =
        clonePlain(runtime);

    delete snapshot.audit;
    delete snapshot.consequence;
    delete snapshot.consequenceKind;
    delete snapshot.routedAt;
    delete snapshot.resolved;
    delete snapshot.resolvedAt;

    return snapshot;
}

export function assertResolvableDualSoulFailure(
    runtime
) {
    if (
        !runtime ||
        typeof runtime !== 'object' ||
        Array.isArray(runtime)
    ) {
        throw new Error(
            'Runtime de Resistência inválido.'
        );
    }

    if (
        runtime.pending !== true ||
        runtime.result !== 'failure'
    ) {
        throw new Error(
            'Somente uma falha pendente pode gerar consequência.'
        );
    }

    const challengerKind =
        normalizeKind(
            runtime.challengerKind
        );

    if (
        !CHALLENGERS.includes(
            challengerKind
        )
    ) {
        throw new Error(
            'challengerKind inválido.'
        );
    }

    return challengerKind;
}

export function routeDualSoulConsequence(
    runtime,
    {
        routedAt = null,
        routedByUserId = null,

        entityName = '',
        demonName = '',

        scopeKind = null,
        sceneId = null,

        trackedCombat = false,
        combatId = null,
        combatantId = null,
        startedWhileActorTurn = false,
    } = {}
) {
    const challengerKind =
        assertResolvableDualSoulFailure(
            runtime
        );

    const existingAudit =
        (
            runtime.audit &&
            typeof runtime.audit === 'object'
        )
            ? clonePlain(runtime.audit)
            : {};

    const audit = {
        ...existingAudit,

        resistanceEvent:
            existingAudit
                .resistanceEvent ??
            originalResistanceSnapshot(
                runtime
            ),
    };

    const base = {
        ...clonePlain(runtime),

        pending:
            false,

        resolved:
            false,

        resolvedAt:
            null,

        routedAt,

        consequenceKind:
            challengerKind === 'entidade'
                ? 'loan'
                : 'possession',

        audit,
    };

    if (
        challengerKind === 'entidade'
    ) {
        return {
            ...base,

            consequence: {
                version:
                    DUAL_SOUL_CONSEQUENCE_VERSION,

                kind:
                    'loan',

                state:
                    'active',

                challengerKind:
                    'entidade',

                entityName:
                    String(
                        entityName ??
                        ''
                    ),

                usesRemaining:
                    1,

                abilityPolicy:
                    'one-entity-ability-current-rank',

                scope: {
                    kind:
                        scopeKind === 'combat'
                            ? 'combat'
                            : 'scene',

                    combatId:
                        scopeKind === 'combat'
                            ? combatId
                            : null,

                    sceneId:
                        scopeKind === 'combat'
                            ? null
                            : sceneId,
                },

                grantedAt:
                    routedAt,

                grantedByUserId:
                    routedByUserId,

                consumedAt:
                    null,

                consumedByUserId:
                    null,

                expiredAt:
                    null,

                expireReason:
                    null,
            },
        };
    }

    return {
        ...base,

        consequence: {
            version:
                DUAL_SOUL_CONSEQUENCE_VERSION,

            kind:
                'possession',

            state:
                trackedCombat
                    ? 'waiting_turn'
                    : 'manual_turn',

            challengerKind:
                'demonio',

            demonName:
                String(
                    demonName ??
                    ''
                ),

            combatId:
                trackedCombat
                    ? combatId
                    : null,

            combatantId:
                trackedCombat
                    ? combatantId
                    : null,

            startedAt:
                routedAt,

            startedByUserId:
                routedByUserId,

            startedWhileActorTurn:
                trackedCombat
                    ? startedWhileActorTurn === true
                    : false,

            /*
             * Se a possessão foi iniciada fora do turno
             * do portador, já observamos um estado "away"
             * e o próximo turno dele pode ser o turno completo.
             *
             * Se iniciou DURANTE o turno dele, primeiro precisamos
             * sair deste turno e só então esperar o próximo.
             */
            seenAway:
                trackedCombat
                    ? startedWhileActorTurn !== true
                    : true,

            seenAwayAt:
                null,

            turnStarted:
                false,

            turnStart:
                null,

            turnEnd:
                null,

            markApplied:
                false,

            markBefore:
                null,

            markAfter:
                null,

            finalizationId:
                null,

            finalizationStartedAt:
                null,

            completedAt:
                null,

            trackingLostAt:
                null,

            trackingLostReason:
                null,
        },
    };
}

export function markPossessionAway(
    runtime,
    {
        at = null,
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
            'possession' ||
        consequence.state !==
            'waiting_turn'
    ) {
        throw new Error(
            'Possessão não está aguardando turno.'
        );
    }

    consequence.seenAway =
        true;

    consequence.seenAwayAt =
        at;

    return next;
}

export function beginPossessionTurn(
    runtime,
    {
        round = null,
        turn = null,
        at = null,
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
            'possession' ||
        consequence.state !==
            'waiting_turn'
    ) {
        throw new Error(
            'Possessão não está aguardando turno.'
        );
    }

    if (
        consequence.seenAway !== true
    ) {
        throw new Error(
            'O turno parcial atual não pode contar como turno completo da Possessão.'
        );
    }

    consequence.state =
        'in_turn';

    consequence.turnStarted =
        true;

    consequence.turnStart = {
        round,
        turn,
        at,
    };

    return next;
}

export function movePossessionToManualTurn(
    runtime,
    {
        at = null,
        reason =
            'automatic-combat-tracking-unavailable',
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
            'possession'
    ) {
        throw new Error(
            'Runtime não contém Possessão.'
        );
    }

    if (
        [
            'complete',
            'finalizing',
        ].includes(
            consequence.state
        )
    ) {
        return next;
    }

    consequence.state =
        'manual_turn';

    consequence.trackingLostAt =
        at;

    consequence.trackingLostReason =
        reason;

    return next;
}

export function consumeDualSoulLoan(
    runtime,
    {
        at = null,
        userId = null,
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
            'loan' ||
        consequence.state !==
            'active' ||
        Number(
            consequence.usesRemaining
        ) !== 1
    ) {
        throw new Error(
            'Não existe Empréstimo ativo com 1 uso disponível.'
        );
    }

    consequence.usesRemaining =
        0;

    consequence.state =
        'consumed';

    consequence.consumedAt =
        at;

    consequence.consumedByUserId =
        userId;

    next.resolved =
        true;

    next.resolvedAt =
        at;

    return next;
}

export function expireDualSoulLoan(
    runtime,
    {
        at = null,
        reason =
            'scene-or-combat-ended',
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
            'loan' ||
        consequence.state !==
            'active'
    ) {
        throw new Error(
            'Não existe Empréstimo ativo para expirar.'
        );
    }

    consequence.usesRemaining =
        0;

    consequence.state =
        'expired';

    consequence.expiredAt =
        at;

    consequence.expireReason =
        reason;

    next.resolved =
        true;

    next.resolvedAt =
        at;

    return next;
}

export function completeDualSoulPossession(
    runtime,
    {
        at = null,

        round = null,
        turn = null,

        markBefore,
        markAfter,

        finalizationId = null,
    } = {}
) {
    const next =
        clonePlain(runtime);

    const consequence =
        next.consequence;

    if (
        consequence?.kind !==
        'possession'
    ) {
        throw new Error(
            'Runtime não contém Possessão.'
        );
    }

    if (
        ![
            'in_turn',
            'manual_turn',
            'finalizing',
        ].includes(
            consequence.state
        )
    ) {
        throw new Error(
            `Possessão não pode ser finalizada no estado ${consequence.state}.`
        );
    }

    const before =
        Math.max(
            0,
            Math.trunc(
                Number(markBefore) ||
                0
            )
        );

    const after =
        Math.max(
            0,
            Math.trunc(
                Number(markAfter) ||
                0
            )
        );

    if (
        after !==
        before + 1
    ) {
        throw new Error(
            'Possessão deve adicionar exatamente +1 Marca do Demônio.'
        );
    }

    consequence.state =
        'complete';

    consequence.turnEnd = {
        round,
        turn,
        at,
    };

    consequence.markApplied =
        true;

    consequence.markBefore =
        before;

    consequence.markAfter =
        after;

    consequence.finalizationId =
        finalizationId;

    consequence.completedAt =
        at;

    next.resolved =
        true;

    next.resolvedAt =
        at;

    return next;
}

export function hasActiveDualSoulConsequence(
    runtime
) {
    if (
        !runtime ||
        typeof runtime !== 'object'
    ) {
        return false;
    }

    if (
        runtime.resolved === true
    ) {
        return false;
    }

    const consequence =
        runtime.consequence;

    if (
        !consequence ||
        typeof consequence !== 'object'
    ) {
        return false;
    }

    if (
        consequence.kind ===
        'loan'
    ) {
        return (
            consequence.state ===
            'active'
        );
    }

    if (
        consequence.kind ===
        'possession'
    ) {
        return [
            'waiting_turn',
            'in_turn',
            'manual_turn',
            'finalizing',
        ].includes(
            consequence.state
        );
    }

    return false;
}