import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDualSoulResistanceEvent,
    challengerKindFromD2,
    hasPendingDualSoulResistance,
    isUnstableDualSoulCeremony,
    normalizeResistanceAttribute,
    resolveDualSoulChallenge,
} from '../scripts/dual-soul-awakening-resistance-core.mjs';

const stableEntity = {
    dominance: {
        kind: 'entidade',
        dominantKind: 'entidade',
        sleepingKind: 'demonio',
    },

    intensity: {
        name: 'Vínculo Forte',
        awakeningCd: 17,
    },
};

const stableDemon = {
    dominance: {
        kind: 'demonio',
        dominantKind: 'demonio',
        sleepingKind: 'entidade',
    },

    intensity: {
        name: 'Vínculo Forte',
        awakeningCd: 17,
    },
};

const unstable = {
    dominance: {
        kind: 'equilibrio',
        dominantKind: 'equilibrio',
        sleepingKind: null,
    },

    intensity: {
        name: 'Vínculo Forte',
        awakeningCd: 17,
    },
};

test(
    'vínculo estável: lado adormecido é o challenger',
    () => {
        assert.deepEqual(
            resolveDualSoulChallenge({
                ceremony:
                    stableEntity,
            }),
            {
                balance:
                    'stable',

                dominantKind:
                    'entidade',

                sleepingKind:
                    'demonio',

                challengerKind:
                    'demonio',

                challengerRoll:
                    null,
            }
        );
    }
);
test(
    'vínculo demoníaco estável desafia com a Entidade adormecida',
    () => {
        const result =
            resolveDualSoulChallenge({
                ceremony:
                    stableDemon,
            });

        assert.equal(
            result.dominantKind,
            'demonio'
        );

        assert.equal(
            result.sleepingKind,
            'entidade'
        );

        assert.equal(
            result.challengerKind,
            'entidade'
        );
    }
);

test(
    'Equilíbrio Instável nunca persiste dominante ou adormecido no evento',
    () => {
        const result =
            resolveDualSoulChallenge({
                ceremony:
                    unstable,

                challengerRollTotal:
                    1,
            });

        assert.equal(
            result.balance,
            'unstable'
        );

        assert.equal(
            result.dominantKind,
            null
        );

        assert.equal(
            result.sleepingKind,
            null
        );
    }
);

test(
    '1d2 = 1 significa Entidade',
    () => {
        assert.equal(
            challengerKindFromD2(1),
            'entidade'
        );

        const result =
            resolveDualSoulChallenge({
                ceremony:
                    unstable,

                challengerRollTotal:
                    1,
            });

        assert.equal(
            result.challengerKind,
            'entidade'
        );

        assert.deepEqual(
            result.challengerRoll,
            {
                formula:
                    '1d2',

                total:
                    1,
            }
        );
    }
);

test(
    '1d2 = 2 significa Demônio',
    () => {
        assert.equal(
            challengerKindFromD2(2),
            'demonio'
        );

        const result =
            resolveDualSoulChallenge({
                ceremony:
                    unstable,

                challengerRollTotal:
                    2,
            });

        assert.equal(
            result.challengerKind,
            'demonio'
        );

        assert.deepEqual(
            result.challengerRoll,
            {
                formula:
                    '1d2',

                total:
                    2,
            }
        );
    }
);

test(
    'falha produz pending=true',
    () => {
        const event =
            buildDualSoulResistanceEvent({
                ceremony:
                    stableEntity,

                attribute:
                    'VIT',

                attributeValue:
                    4,

                rollTotal:
                    13,

                dc:
                    17,
            });

        assert.equal(
            event.result,
            'failure'
        );

        assert.equal(
            event.pending,
            true
        );

        assert.equal(
            event.challengerKind,
            'demonio'
        );
    }
);

test(
    'sucesso produz pending=false e empate com CD é sucesso',
    () => {
        const event =
            buildDualSoulResistanceEvent({
                ceremony:
                    stableEntity,

                attribute:
                    'FOR',

                attributeValue:
                    5,

                rollTotal:
                    17,

                dc:
                    17,
            });

        assert.equal(
            event.result,
            'success'
        );

        assert.equal(
            event.pending,
            false
        );
    }
);

test(
    'evento instável mantém challengerRoll para auditoria',
    () => {
        const event =
            buildDualSoulResistanceEvent({
                ceremony:
                    unstable,

                challengerRollTotal:
                    2,

                attribute:
                    'VIT',

                attributeValue:
                    3,

                rollTotal:
                    13,

                dc:
                    17,

                combatId:
                    'combat-1',

                round:
                    4,
            });

        assert.deepEqual(
            {
                pending:
                    event.pending,

                result:
                    event.result,

                balance:
                    event.balance,

                dominantKind:
                    event.dominantKind,

                sleepingKind:
                    event.sleepingKind,

                challengerKind:
                    event.challengerKind,

                challengerRoll:
                    event.challengerRoll,

                attribute:
                    event.attribute,

                rollTotal:
                    event.rollTotal,

                dc:
                    event.dc,

                combatId:
                    event.combatId,

                round:
                    event.round,
            },
            {
                pending:
                    true,

                result:
                    'failure',

                balance:
                    'unstable',

                dominantKind:
                    null,

                sleepingKind:
                    null,

                challengerKind:
                    'demonio',

                challengerRoll: {
                    formula:
                        '1d2',

                    total:
                        2,
                },

                attribute:
                    'VIT',

                rollTotal:
                    13,

                dc:
                    17,

                combatId:
                    'combat-1',

                round:
                    4,
            }
        );
    }
);

test(
    'somente FOR ou VIT são válidos',
    () => {
        assert.equal(
            normalizeResistanceAttribute(
                'for'
            ),
            'FOR'
        );

        assert.equal(
            normalizeResistanceAttribute(
                'vit'
            ),
            'VIT'
        );

        assert.throws(
            () =>
                normalizeResistanceAttribute(
                    'DEX'
                ),
            /FOR ou VIT/
        );
    }
);

test(
    'runtime pendente só existe para falha com challenger válido',
    () => {
        assert.equal(
            hasPendingDualSoulResistance(
                JSON.stringify({
                    pending: true,
                    result: 'failure',
                    challengerKind:
                        'demonio',
                })
            ),
            true
        );

        assert.equal(
            hasPendingDualSoulResistance(
                JSON.stringify({
                    pending: false,
                    result: 'success',
                    challengerKind:
                        'demonio',
                })
            ),
            false
        );
    }
);
