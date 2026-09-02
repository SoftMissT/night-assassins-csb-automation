import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDualSoulCeremonyResult,
    dominanceD20Equivalent,
    dualSoulCeremonyCompleted,
    dualSoulDominance,
    dualSoulIntensity,
    dualSoulTrigger,
    lookupDualSoulRange,
} from '../scripts/dual-soul-ceremony-core.mjs';

test(
    'Teste 1 segue as cinco faixas canônicas',
    () => {
        assert.equal(
            dualSoulDominance(1).kind,
            'demonio'
        );

        assert.equal(
            dualSoulDominance(3).relation,
            'domina'
        );

        assert.equal(
            dualSoulDominance(4).relation,
            'favorecido'
        );

        assert.equal(
            dualSoulDominance(8).kind,
            'demonio'
        );

        assert.equal(
            dualSoulDominance(9).kind,
            'equilibrio'
        );

        assert.equal(
            dualSoulDominance(12).kind,
            'equilibrio'
        );

        assert.equal(
            dualSoulDominance(13).kind,
            'entidade'
        );

        assert.equal(
            dualSoulDominance(17).relation,
            'favorecido'
        );

        assert.equal(
            dualSoulDominance(18).relation,
            'domina'
        );

        assert.equal(
            dualSoulDominance(20).kind,
            'entidade'
        );
    }
);

test(
    'Teste 1 trabalha com nomes arbitrários',
    () => {
        const left =
            dualSoulDominance(
                2,
                {
                    entityName: 'Alpha',
                    demonName: 'Beta',
                }
            );

        const right =
            dualSoulDominance(
                19,
                {
                    entityName: 'Alpha',
                    demonName: 'Beta',
                }
            );

        assert.equal(
            left.dominantName,
            'Beta'
        );

        assert.equal(
            left.sleepingName,
            'Alpha'
        );

        assert.equal(
            right.dominantName,
            'Alpha'
        );

        assert.equal(
            right.sleepingName,
            'Beta'
        );
    }
);

test(
    '1d100 preserva as vinte posições da tabela de 1d20',
    () => {
        assert.equal(
            dominanceD20Equivalent(
                1,
                '1d100'
            ),
            1
        );

        assert.equal(
            dominanceD20Equivalent(
                5,
                '1d100'
            ),
            1
        );

        assert.equal(
            dominanceD20Equivalent(
                6,
                '1d100'
            ),
            2
        );

        assert.equal(
            dominanceD20Equivalent(
                40,
                '1d100'
            ),
            8
        );

        assert.equal(
            dominanceD20Equivalent(
                41,
                '1d100'
            ),
            9
        );

        assert.equal(
            dominanceD20Equivalent(
                60,
                '1d100'
            ),
            12
        );

        assert.equal(
            dominanceD20Equivalent(
                61,
                '1d100'
            ),
            13
        );

        assert.equal(
            dominanceD20Equivalent(
                85,
                '1d100'
            ),
            17
        );

        assert.equal(
            dominanceD20Equivalent(
                86,
                '1d100'
            ),
            18
        );

        assert.equal(
            dominanceD20Equivalent(
                100,
                '1d100'
            ),
            20
        );
    }
);

test(
    'Teste 2 produz exatamente os seis Valores de Vínculo',
    () => {
        assert.deepEqual(
            [
                dualSoulIntensity(3).value,
                dualSoulIntensity(15).value,
                dualSoulIntensity(25).value,
                dualSoulIntensity(39).value,
                dualSoulIntensity(49).value,
                dualSoulIntensity(58).value,
            ],
            [1, 2, 3, 4, 5, 6]
        );

        assert.equal(
            dualSoulIntensity(60).name,
            'Vínculo Absoluto'
        );
    }
);

test(
    'Teste 3 usa comum, tensão, raro e oculto',
    () => {
        assert.equal(
            dualSoulTrigger(3).id,
            'comum'
        );

        assert.equal(
            dualSoulTrigger(14).id,
            'comum'
        );

        assert.equal(
            dualSoulTrigger(15).id,
            'tensao'
        );

        assert.equal(
            dualSoulTrigger(38).id,
            'tensao'
        );

        assert.equal(
            dualSoulTrigger(39).id,
            'raro'
        );

        assert.equal(
            dualSoulTrigger(57).id,
            'raro'
        );

        assert.equal(
            dualSoulTrigger(58).id,
            'oculto'
        );

        assert.equal(
            dualSoulTrigger(60).id,
            'oculto'
        );
    }
);

test(
    'lookup resolve faixas ASCII ou en dash',
    () => {
        const table = {
            '3–14': 'A',
            '15-38': 'B',
            '39-57': 'C',
            '58-60': 'D',
            '61+': 'E',
        };

        assert.equal(
            lookupDualSoulRange(
                table,
                14
            ),
            'A'
        );

        assert.equal(
            lookupDualSoulRange(
                table,
                15
            ),
            'B'
        );

        assert.equal(
            lookupDualSoulRange(
                table,
                57
            ),
            'C'
        );

        assert.equal(
            lookupDualSoulRange(
                table,
                60
            ),
            'D'
        );

        assert.equal(
            lookupDualSoulRange(
                table,
                70
            ),
            'E'
        );
    }
);

test(
    'gatilho 58-60 não é exposto no runtime público',
    () => {
        const result =
            buildDualSoulCeremonyResult({
                test1Total: 10,
                test2Total: 30,
                test3Total: 59,

                entityName: 'Alpha',
                demonName: 'Beta',

                tests: {
                    teste_1_lado_dominante: {
                        '9-12':
                            'Equilíbrio.',
                    },

                    teste_2_intensidade_vinculo: {
                        'Vínculo Comum':
                            '+3',
                    },

                    teste_3_gatilho_lado_adormecido: {
                        '58-60':
                            'SEGREDO',
                    },

                    teste_de_despertar: {
                        'Vínculo Comum':
                            15,
                    },
                },
            });

        assert.equal(
            result.trigger.publicText,
            'Gatilho oculto do Mestre.'
        );

        assert.equal(
            result.trigger.sourceText,
            ''
        );

        assert.equal(
            result.intensity.awakeningCd,
            15
        );
    }
);

test(
    'Cerimônia só é concluída com runtime.completed=true',
    () => {
        assert.equal(
            dualSoulCeremonyCompleted(
                '{}'
            ),
            false
        );

        assert.equal(
            dualSoulCeremonyCompleted(
                JSON.stringify({
                    teste_1_lado_dominante: {},
                })
            ),
            false
        );

        assert.equal(
            dualSoulCeremonyCompleted(
                JSON.stringify({
                    runtime: {
                        completed: true,
                    },
                })
            ),
            true
        );
    }
);
