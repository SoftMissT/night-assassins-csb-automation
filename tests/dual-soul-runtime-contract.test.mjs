import assert from 'node:assert/strict';
import {
    readFile,
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

async function source(relative) {
    return readFile(
        path.join(
            root,
            relative
        ),
        'utf8'
    );
}

test(
    'Dual Soul Core não contém conhecimento nominal de armas',
    async () => {
        const files = [
            'scripts/dual-soul-ceremony-core.mjs',
            'scripts/dual-soul-ceremony-service.mjs',
        ];

        const forbidden =
            /\b(?:Yamato|Forseti|Orochi|Cérbero|Hécate|Weal|Woe|Cástor|Pólux|Rebellion|Boosted Gear)\b/iu;

        for (const file of files) {
            assert.doesNotMatch(
                await source(file),
                forbidden,
                `${file} contém conhecimento específico de arma.`
            );
        }
    }
);

test(
    'Yamato consome Cerimônia persistida e não reescreve Teste 1',
    async () => {
        const code =
            await source(
                'scripts/special-weapon-awakening-service.mjs'
            );

        assert.match(
            code,
            /dualSoulCeremonyCompleted/
        );

        assert.match(
            code,
            /getDualSoulCeremonyState/
        );

        assert.match(
            code,
            /dominantKind/
        );

        assert.match(
            code,
            /arma_especial_integracao/
        );

        assert.doesNotMatch(
            code,
            /['"]system\.props\.arma_lado_dominante['"]\s*:/
        );

        assert.doesNotMatch(
            code,
            /Escolha o lado dominante/
        );
    }
);

test(
    'habilidades da Yamato usam lado ativo sem reescrever Cerimônia',
    async () => {
        const code =
            await source(
                'scripts/special-weapon-service.mjs'
            );

        assert.match(
            code,
            /currentYamatoSide/
        );

        assert.doesNotMatch(
            code,
            /chooseYamatoSide/
        );

        assert.doesNotMatch(
            code,
            /['"]system\.props\.arma_lado_dominante['"]\s*:/
        );
    }
);

test(
    'main expõe a API genérica da Cerimônia',
    async () => {
        const code =
            await source(
                'scripts/main.mjs'
            );

        for (
            const name
            of [
                'openDualSoulCeremony',
                'getDualSoulCeremonyState',
                'dualSoulCeremonyCompleted',
                'isDualSoulWeapon',
            ]
        ) {
            assert.match(
                code,
                new RegExp(name)
            );
        }
    }
);

test(
    'macro genérica está registrada',
    async () => {
        const builder =
            await source(
                'tools/build-macro-sources.mjs'
            );

        assert.match(
            builder,
            /NADualSoulCer001/
        );

        assert.match(
            builder,
            /na-cerimonia-vinculo\.js/
        );
    }
);

test(
    'template usa painel CSB genérico e não DOM injection',
    async () => {
        const template =
            JSON.parse(
                await source(
                    'src/templates/items/special-slayer-weapon-template.json'
                )
            );

        function find(
            node,
            key
        ) {
            if (
                !node ||
                typeof node !== 'object'
            ) {
                return null;
            }

            if (node.key === key) {
                return node;
            }

            if (Array.isArray(node)) {
                for (
                    const child
                    of node
                ) {
                    const hit =
                        find(
                            child,
                            key
                        );

                    if (hit) {
                        return hit;
                    }
                }

                return null;
            }

            for (
                const value
                of Object.values(node)
            ) {
                if (
                    value &&
                    typeof value === 'object'
                ) {
                    const hit =
                        find(
                            value,
                            key
                        );

                    if (hit) {
                        return hit;
                    }
                }
            }

            return null;
        }

        const panel =
            find(
                template.system,
                'dupla_alma_cerimonia_ui'
            );

        assert.ok(panel);

        assert.equal(
            panel.visibilityFormula,
            'equalText(arma_categoria, "especial")'
        );

        const serialized =
            JSON.stringify(panel);

        assert.match(
            serialized,
            /openDualSoulCeremony/
        );

        assert.doesNotMatch(
            serialized,
            /Yamato|Forseti|Orochi|Cérbero|Weal|Woe/iu
        );
    }
);
