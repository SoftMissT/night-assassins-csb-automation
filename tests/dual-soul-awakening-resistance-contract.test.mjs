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
    'Resistance Core e Service permanecem genéricos',
    async () => {
        const files = [
            'scripts/dual-soul-awakening-resistance-core.mjs',
            'scripts/dual-soul-awakening-resistance-service.mjs',
        ];

        const forbidden =
            /\b(?:Yamato|Forseti|Orochi|Cérbero|Hécate|Weal|Woe|Cástor|Pólux|Rebellion|Boosted Gear)\b/iu;

        for (const file of files) {
            assert.doesNotMatch(
                await source(file),
                forbidden,
                `${file} contém nome específico de arma/espírito.`
            );
        }
    }
);

test(
    'Equilíbrio usa Roll real 1d2 e nunca Math.random',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-awakening-resistance-service.mjs'
            );

        assert.match(
            code,
            /Roll\.create\(\s*['"]1d2['"]\s*\)/u
        );

        assert.match(
            code,
            /\.evaluate\(\)/
        );

        assert.match(
            code,
            /\.toMessage\(\{/
        );

        assert.doesNotMatch(
            code,
            /Math\.random/
        );
    }
);
test(
    'Resistência lê FOR/VIT finais da ficha',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-awakening-resistance-service.mjs'
            );

        assert.match(
            code,
            /for_display/
        );

        assert.match(
            code,
            /vit_display/
        );

        assert.match(
            code,
            /parseAttributeValue/
        );

        assert.match(
            code,
            /1d20 \+ \$\{chosenValue\}/
        );
    }
);

test(
    'v0.11.64 escreve somente o runtime do evento Dual Soul',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-awakening-resistance-service.mjs'
            );

        assert.match(
            code,
            /system\.props\.\$\{RUNTIME_KEY\}/
        );

        assert.doesNotMatch(
            code,
            /['"]system\.props\.dupla_alma_cerimonia_json['"]\s*:/
        );

        assert.doesNotMatch(
            code,
            /['"]system\.props\.arma_lado_dominante['"]\s*:/
        );

        assert.doesNotMatch(
            code,
            /['"]system\.props\.arma_marcas_demonio['"]\s*:/
        );
    }
);

test(
    'v0.11.64 não implementa consequência da falha',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-awakening-resistance-service.mjs'
            );

        assert.doesNotMatch(
            code,
            /arma_marcas_demonio/
        );

        assert.doesNotMatch(
            code,
            /pdv_slayer_dano_ferida/
        );

        assert.doesNotMatch(
            code,
            /consumeSlayerActions/
        );

        assert.doesNotMatch(
            code,
            /Hooks\.on/
        );
    }
);

test(
    'template possui botão genérico e runtime separado',
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

            if (
                node.key === key
            ) {
                return node;
            }

            if (Array.isArray(node)) {
                for (const child of node) {
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
                'dupla_alma_resistencia_ui'
            );

        const runtime =
            find(
                template.system,
                'dupla_alma_despertar_runtime_json'
            );

        assert.ok(panel);
        assert.ok(runtime);

        assert.equal(
            panel.visibilityFormula,
            'equalText(arma_categoria, "especial")'
        );

        assert.equal(
            runtime.defaultValue,
            '{}'
        );

        assert.match(
            JSON.stringify(panel),
            /openDualSoulAwakeningResistance/
        );
    }
);

test(
    'builder inicializa runtime separado para todas as especiais',
    async () => {
        const builder =
            await source(
                'tools/build-weapon-sources.mjs'
            );

        const hydration =
            await source(
                'scripts/special-weapon-service.mjs'
            );

        assert.match(
            builder,
            /dupla_alma_despertar_runtime_json:\s*['"]\{\}['"]/
        );

        assert.match(
            hydration,
            /['"]dupla_alma_despertar_runtime_json['"]/
        );
    }
);

test(
    'main expõe API da Resistência',
    async () => {
        const main =
            await source(
                'scripts/main.mjs'
            );

        for (
            const name
            of [
                'openDualSoulAwakeningResistance',
                'getDualSoulAwakeningRuntime',
                'dualSoulAwakeningPending',
            ]
        ) {
            assert.match(
                main,
                new RegExp(name)
            );
        }
    }
);

test(
    'macro genérica da Resistência está registrada',
    async () => {
        const builder =
            await source(
                'tools/build-macro-sources.mjs'
            );

        assert.match(
            builder,
            /NADualSoulRes001/
        );

        assert.match(
            builder,
            /na-resistir-despertar\.js/
        );
    }
);
