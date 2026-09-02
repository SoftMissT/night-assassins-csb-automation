import assert from 'node:assert/strict';
import {
    readFile,
    readdir,
} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
    fileURLToPath,
} from 'node:url';

const root =
    path.resolve(
        path.dirname(
            fileURLToPath(
                import.meta.url
            )
        ),
        '..'
    );

const sourceDirectory =
    path.join(
        root,
        'data',
        'catalog-source',
        'weapons',
        'especiais'
    );

const EXPECTED_SPECIAL_WEAPONS = Object.freeze([
    'Boosted Gear Manoplas do Imperador Dragão Vermelho',
    'Cérbero',
    'Correntes de Jade Ceifadoras de Chi',
    'Êxtase Tesoura da Névoa Sagrada',
    'Gáe Bolg Espinho do Destino Selado',
    'Gilgamesh Yoroi do Sol',
    'Gumbai Leque do Pilar Quebrado',
    "Imperator's Edge Estandarte das Cem Legiões",
    'Impurity Arms Punhos Gêmeos de Kegare',
    'Moonfang Runkah',
    'Orochimaru Jakkojin',
    'Playful Cloud Sansetsukon da Nuvem Irônica',
    'Rebellion',
    'Red Queen Motor Carmesim',
    'Weal and Woe Lanças Gêmeas de Obsidiana Umbral',
    'Woldo Lua do Exílio',
    "Yamato The Rift-Walker's Legacy",
]);

const INTENSITIES = Object.freeze([
    'Vínculo Frágil',
    'Vínculo Fraco',
    'Vínculo Comum',
    'Vínculo Forte',
    'Vínculo Profundo',
    'Vínculo Absoluto',
]);

async function specialSources() {
    const files =
        (
            await readdir(
                sourceDirectory
            )
        )
            .filter(
                (file) =>
                    file.endsWith('.json')
            )
            .sort();

    const result = [];

    for (const file of files) {
        const document =
            JSON.parse(
                await readFile(
                    path.join(
                        sourceDirectory,
                        file
                    ),
                    'utf8'
                )
            );

        if (
            document.type !==
            'equippableItem'
        ) {
            continue;
        }

        if (
            String(
                document
                    .system
                    ?.props
                    ?.arma_categoria ??
                ''
            )
                .toLocaleLowerCase(
                    'pt-BR'
                ) !== 'especial'
        ) {
            continue;
        }

        result.push({
            file,
            document,
        });
    }

    return result;
}

function assertCanonicalCeremony(
    props,
    prefix
) {
    const tests =
        props.arma_testes;

    assert.ok(
        tests &&
        typeof tests === 'object' &&
        !Array.isArray(tests),

        `${prefix}: arma_testes não é objeto canônico`
    );

    assert.deepEqual(
        Object.keys(
            tests.teste_1_lado_dominante ??
            {}
        ).sort(),
        [
            '1-3',
            '13-17',
            '18-20',
            '4-8',
            '9-12',
        ].sort(),

        `${prefix}: faixas do Teste 1 inválidas`
    );

    assert.deepEqual(
        Object.keys(
            tests.teste_3_gatilho_lado_adormecido ??
            {}
        ).sort(),
        [
            '3-14',
            '15-38',
            '39-57',
            '58-60',
        ].sort(),

        `${prefix}: faixas do Teste 3 inválidas`
    );

    for (
        const intensity
        of INTENSITIES
    ) {
        assert.ok(
            Object.hasOwn(
                tests
                    .teste_2_intensidade_vinculo ??
                {},
                intensity
            ),

            `${prefix}: Teste 2 sem ${intensity}`
        );

        assert.ok(
            Number.isFinite(
                Number(
                    tests
                        .teste_de_despertar
                        ?.[intensity]
                )
            ),

            `${prefix}: CD inválida para ${intensity}`
        );
    }
}

test(
    'fontes especiais são exatamente as 17 armas canônicas',
    async () => {
        const sources =
            await specialSources();

        const names =
            sources.map(
                ({ document }) =>
                    document.name
            );

        assert.equal(
            sources.length,
            17,
            `Esperadas exatamente 17 fontes especiais; encontradas ${sources.length}.`
        );

        assert.equal(
            new Set(names).size,
            17,
            'Há nomes duplicados entre as fontes especiais.'
        );

        assert.deepEqual(
            [...names].sort(),
            [...EXPECTED_SPECIAL_WEAPONS].sort()
        );

        assert.ok(
            names.includes(
                'Woldo Lua do Exílio'
            )
        );

        assert.ok(
            !names.includes(
                'Woldo'
            )
        );
    }
);

test(
    'todas as 17 possuem contrato Dual Soul canônico',
    async () => {
        const sources =
            await specialSources();

        assert.equal(
            sources.length,
            17
        );

        for (
            const {
                file,
                document,
            }
            of sources
        ) {
            const props =
                document
                    .system
                    ?.props ??
                {};

            const prefix =
                `${file} / ${document.name}`;

            assert.ok(
                String(
                    props.arma_entidade ??
                    ''
                ).trim(),
                `${prefix}: arma_entidade ausente`
            );

            assert.ok(
                String(
                    props.arma_demonio ??
                    ''
                ).trim(),
                `${prefix}: arma_demonio ausente`
            );

            assertCanonicalCeremony(
                props,
                prefix
            );
        }
    }
);

test(
    'Cérbero preserva literalmente a Cerimônia publicada',
    async () => {
        const sources =
            await specialSources();

        const cerbero =
            sources.find(
                ({ document }) =>
                    document.name ===
                    'Cérbero'
            )?.document;

        assert.ok(cerbero);

        assert.deepEqual(
            cerbero
                .system
                .props
                .arma_testes,
            {
                teste_1_lado_dominante: {
                    '1-3':
                        'Cérbero domina. Use efeitos de Cérbero. Hécate dorme fundo.',

                    '4-8':
                        'Cérbero favorecido. Use efeitos de Cérbero. Hécate desperta apenas pelo gatilho.',

                    '9-12':
                        'Equilíbrio instável. Ao realizar o Ritual, escolha Hécate ou Cérbero.',

                    '13-17':
                        'Hécate favorecida. Use efeitos de Hécate. Cérbero desperta apenas pelo gatilho.',

                    '18-20':
                        'Hécate domina. Use efeitos de Hécate. Cérbero dorme fundo.',
                },

                teste_2_intensidade_vinculo: {
                    'Vínculo Frágil': '+1',
                    'Vínculo Fraco': '+2',
                    'Vínculo Comum': '+3',
                    'Vínculo Forte': '+4',
                    'Vínculo Profundo': '+5',
                    'Vínculo Absoluto': '+6',
                },

                teste_3_gatilho_lado_adormecido: {
                    '3-14':
                        'Um inimigo entra ou sai do seu alcance sem Desengajar.',

                    '15-38':
                        'Você ou um aliado protegido sofre acerto crítico.',

                    '39-57':
                        'Um inimigo atravessa sua guarda e fere alguém que você declarou proteger.',

                    '58-60':
                        'Gatilho oculto do Mestre, ligado ao abandono de um juramento de guarda.',
                },

                teste_de_despertar: {
                    'Vínculo Frágil': 11,
                    'Vínculo Fraco': 13,
                    'Vínculo Comum': 15,
                    'Vínculo Forte': 17,
                    'Vínculo Profundo': 19,
                    'Vínculo Absoluto': 21,
                },
            }
        );
    }
);

test(
    'Weal and Woe é fonte independente e canônica',
    async () => {
        const sources =
            await specialSources();

        const hit =
            sources.find(
                ({ document }) =>
                    document.name ===
                    'Weal and Woe Lanças Gêmeas de Obsidiana Umbral'
            );

        assert.ok(hit);

        assert.equal(
            hit.file,
            'weal-and-woe-weapon.json'
        );

        const weapon =
            hit.document;

        const props =
            weapon.system.props;

        assert.equal(
            weapon._id,
            '0c806f39dc4e8972'
        );

        assert.equal(
            weapon.system.template,
            'NASpecialWeaponTpl00001'
        );

        assert.equal(
            props.arma_entidade,
            'Cástor'
        );

        assert.equal(
            props.arma_demonio,
            'Pólux'
        );

        assert.equal(
            props.arma_critico,
            19
        );

        assert.equal(
            props.arma_alcance,
            '2m'
        );

        assert.equal(
            props.arma_reacao_entidade,
            'Defesa'
        );

        assert.deepEqual(
            props
                .arma_testes
                .teste_1_lado_dominante,
            {
                '1-3':
                    'Pólux domina. Woe conduz. Use efeitos de Pólux. Cástor dorme fundo.',

                '4-8':
                    'Pólux favorecido. Woe conduz. Use efeitos de Pólux. Cástor desperta apenas pelo gatilho.',

                '9-12':
                    'Equilíbrio instável. Ao realizar o Ritual, escolha Weal/Cástor ou Woe/Pólux.',

                '13-17':
                    'Cástor favorecido. Weal conduz. Use efeitos de Cástor. Pólux desperta apenas pelo gatilho.',

                '18-20':
                    'Cástor domina. Weal conduz. Use efeitos de Cástor. Pólux dorme fundo.',
            }
        );

        assert.deepEqual(
            props
                .arma_testes
                .teste_3_gatilho_lado_adormecido,
            {
                '3-14':
                    'Uma das lanças sai do alcance de 12m da outra.',

                '15-38':
                    'Você ou um aliado vinculado sofre acerto crítico.',

                '39-57':
                    'Uma lança seria destruída, roubada ou separada à força.',

                '58-60':
                    'Gatilho oculto do Mestre.',
            }
        );

        assert.equal(
            props
                .arma_dano_por_rank
                .D
                .formula,
            '5 + DEX + 1d6 / Perfurante'
        );

        assert.equal(
            props
                .arma_dano_por_rank
                .SS
                .formula,
            '5 + DEX + 2d8 / Perfurante'
        );

        assert.equal(
            props
                .arma_ritual
                .nome,
            'Sangue Entre as Gêmeas'
        );

        assert.equal(
            props
                .arma_marcas_demonio,
            0
        );
    }
);
