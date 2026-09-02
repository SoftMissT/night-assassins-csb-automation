import assert from 'node:assert/strict';
import test from 'node:test';

import {
    beginPossessionTurn,
    completeDualSoulPossession,
    consumeDualSoulLoan,
    expireDualSoulLoan,
    hasActiveDualSoulConsequence,
    markPossessionAway,
    routeDualSoulConsequence,
} from '../scripts/dual-soul-consequence-core.mjs';

function failure(
    challengerKind,
    extra = {}
) {
    return {
        version: 1,

        eventId:
            'event-1',

        createdAt:
            '2026-09-02T18:00:00.000Z',

        pending:
            true,

        result:
            'failure',

        balance:
            'stable',

        dominantKind:
            'entidade',

        sleepingKind:
            'demonio',

        challengerKind,

        attribute:
            'VIT',

        attributeValue:
            4,

        rollTotal:
            13,

        dc:
            17,

        combatId:
            'combat-old',

        round:
            4,

        turn:
            2,

        ...extra,
    };
}

test(
    'challengerKind entidade roteia exclusivamente para Empréstimo',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'entidade'
                ),
                {
                    routedAt:
                        'now',

                    entityName:
                        'Alpha',

                    scopeKind:
                        'combat',

                    combatId:
                        'combat-1',
                }
            );

        assert.equal(
            routed.pending,
            false
        );

        assert.equal(
            routed.resolved,
            false
        );

        assert.equal(
            routed.consequenceKind,
            'loan'
        );

        assert.equal(
            routed
                .consequence
                .kind,
            'loan'
        );

        assert.equal(
            routed
                .consequence
                .usesRemaining,
            1
        );

        assert.equal(
            routed
                .consequence
                .abilityPolicy,
            'one-entity-ability-current-rank'
        );

        assert.equal(
            routed
                .consequence
                .scope
                .kind,
            'combat'
        );
    }
);

test(
    'challengerKind demonio roteia exclusivamente para Possessão',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'demonio'
                ),
                {
                    routedAt:
                        'now',

                    demonName:
                        'Beta',

                    trackedCombat:
                        true,

                    combatId:
                        'combat-1',

                    combatantId:
                        'combatant-1',

                    startedWhileActorTurn:
                        false,
                }
            );

        assert.equal(
            routed.consequenceKind,
            'possession'
        );

        assert.equal(
            routed
                .consequence
                .state,
            'waiting_turn'
        );

        assert.equal(
            routed
                .consequence
                .markApplied,
            false
        );

        assert.equal(
            routed
                .consequence
                .seenAway,
            true
        );
    }
);

test(
    'Equilíbrio ou vínculo estável não altera roteamento: só challengerKind importa',
    () => {
        const stable =
            routeDualSoulConsequence(
                failure(
                    'entidade',
                    {
                        balance:
                            'stable',
                    }
                )
            );

        const unstable =
            routeDualSoulConsequence(
                failure(
                    'entidade',
                    {
                        balance:
                            'unstable',

                        dominantKind:
                            null,

                        sleepingKind:
                            null,
                    }
                )
            );

        assert.equal(
            stable.consequenceKind,
            'loan'
        );

        assert.equal(
            unstable.consequenceKind,
            'loan'
        );
    }
);

test(
    'snapshot preserva evento original antes da consequência',
    () => {
        const original =
            failure(
                'demonio',
                {
                    balance:
                        'unstable',

                    dominantKind:
                        null,

                    sleepingKind:
                        null,

                    challengerRoll: {
                        formula:
                            '1d2',

                        total:
                            2,
                    },
                }
            );

        const routed =
            routeDualSoulConsequence(
                original,
                {
                    trackedCombat:
                        false,
                }
            );

        assert.deepEqual(
            routed
                .audit
                .resistanceEvent,
            original
        );

        assert.equal(
            routed
                .audit
                .resistanceEvent
                .pending,
            true
        );

        assert.equal(
            routed.pending,
            false
        );
    }
);

test(
    'Empréstimo consumido resolve evento sem Marca',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'entidade'
                )
            );

        const consumed =
            consumeDualSoulLoan(
                routed,
                {
                    at:
                        'used',

                    userId:
                        'user-1',
                }
            );

        assert.equal(
            consumed.resolved,
            true
        );

        assert.equal(
            consumed
                .consequence
                .state,
            'consumed'
        );

        assert.equal(
            consumed
                .consequence
                .usesRemaining,
            0
        );

        assert.equal(
            Object.hasOwn(
                consumed
                    .consequence,
                'markApplied'
            ),
            false
        );
    }
);

test(
    'Empréstimo pode expirar sem uso',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'entidade'
                )
            );

        const expired =
            expireDualSoulLoan(
                routed,
                {
                    at:
                        'end',

                    reason:
                        'combat-ended',
                }
            );

        assert.equal(
            expired.resolved,
            true
        );

        assert.equal(
            expired
                .consequence
                .state,
            'expired'
        );

        assert.equal(
            expired
                .consequence
                .expireReason,
            'combat-ended'
        );
    }
);

test(
    'Possessão iniciada durante turno atual exige sair antes do próximo turno completo',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'demonio'
                ),
                {
                    trackedCombat:
                        true,

                    combatId:
                        'combat-1',

                    combatantId:
                        'combatant-1',

                    startedWhileActorTurn:
                        true,
                }
            );

        assert.equal(
            routed
                .consequence
                .seenAway,
            false
        );

        assert.throws(
            () =>
                beginPossessionTurn(
                    routed
                ),
            /turno parcial/
        );

        const away =
            markPossessionAway(
                routed,
                {
                    at:
                        'away',
                }
            );

        const started =
            beginPossessionTurn(
                away,
                {
                    round:
                        5,

                    turn:
                        3,

                    at:
                        'start',
                }
            );

        assert.equal(
            started
                .consequence
                .state,
            'in_turn'
        );

        assert.equal(
            started
                .consequence
                .turnStarted,
            true
        );
    }
);

test(
    'Possessão aplica exatamente +1 Marca somente na finalização',
    () => {
        const routed =
            routeDualSoulConsequence(
                failure(
                    'demonio'
                ),
                {
                    trackedCombat:
                        true,

                    combatId:
                        'combat-1',

                    combatantId:
                        'combatant-1',

                    startedWhileActorTurn:
                        false,
                }
            );

        assert.equal(
            routed
                .consequence
                .markApplied,
            false
        );

        const started =
            beginPossessionTurn(
                routed,
                {
                    round:
                        5,

                    turn:
                        2,
                }
            );

        const completed =
            completeDualSoulPossession(
                started,
                {
                    at:
                        'end',

                    markBefore:
                        4,

                    markAfter:
                        5,

                    finalizationId:
                        'lock-1',
                }
            );

        assert.equal(
            completed.resolved,
            true
        );

        assert.equal(
            completed
                .consequence
                .state,
            'complete'
        );

        assert.equal(
            completed
                .consequence
                .markApplied,
            true
        );

        assert.equal(
            completed
                .consequence
                .markBefore,
            4
        );

        assert.equal(
            completed
                .consequence
                .markAfter,
            5
        );

        assert.throws(
            () =>
                completeDualSoulPossession(
                    started,
                    {
                        markBefore:
                            4,

                        markAfter:
                            6,
                    }
                ),
            /exatamente \+1/
        );
    }
);

test(
    'consequência ativa bloqueia novo evento até ser concluída',
    () => {
        const loan =
            routeDualSoulConsequence(
                failure(
                    'entidade'
                )
            );

        const possession =
            routeDualSoulConsequence(
                failure(
                    'demonio'
                ),
                {
                    trackedCombat:
                        false,
                }
            );

        assert.equal(
            hasActiveDualSoulConsequence(
                loan
            ),
            true
        );

        assert.equal(
            hasActiveDualSoulConsequence(
                possession
            ),
            true
        );

        assert.equal(
            hasActiveDualSoulConsequence(
                consumeDualSoulLoan(
                    loan
                )
            ),
            false
        );
    }
);