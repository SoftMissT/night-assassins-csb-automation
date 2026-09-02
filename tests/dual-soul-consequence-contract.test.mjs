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

async function source(
    relative
) {
    return readFile(
        path.join(
            root,
            relative
        ),
        'utf8'
    );
}

test(
    'Consequence Core e Service permanecem genéricos',
    async () => {
        const forbidden =
            /\b(?:Yamato|Forseti|Orochi|Cérbero|Hécate|Weal|Woe|Cástor|Pólux|Rebellion|Boosted Gear)\b/iu;

        for (
            const file
            of [
                'scripts/dual-soul-consequence-core.mjs',
                'scripts/dual-soul-consequence-service.mjs',
            ]
        ) {
            assert.doesNotMatch(
                await source(file),
                forbidden
            );
        }
    }
);

test(
    'resolver não possui Roll ou rerrolagem',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-consequence-service.mjs'
            );

        assert.doesNotMatch(
            code,
            /\bRoll\b/u
        );

        assert.doesNotMatch(
            code,
            /Math\.random/u
        );

        assert.doesNotMatch(
            code,
            /1d20|1d2/u
        );
    }
);

test(
    'resolver não escreve Cerimônia nem lado dominante',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-consequence-service.mjs'
            );

        for (
            const forbidden
            of [
                'dupla_alma_cerimonia_json',
                'arma_lado_dominante',
                'arma_vinculo_intensidade',
                'arma_vinculo_valor',
                'arma_gatilho_despertar',
            ]
        ) {
            assert.doesNotMatch(
                code,
                new RegExp(
                    `system\\.props\\.${forbidden}`
                )
            );
        }
    }
);

test(
    'consequência não depende de balance para decidir ramo',
    async () => {
        const core =
            await source(
                'scripts/dual-soul-consequence-core.mjs'
            );

        const service =
            await source(
                'scripts/dual-soul-consequence-service.mjs'
            );

        assert.doesNotMatch(
            core,
            /\.balance\b/u
        );

        assert.doesNotMatch(
            service,
            /\.balance\b/u
        );

        assert.match(
            core,
            /challengerKind/
        );
    }
);

test(
    'Possessão não modifica ownership do Actor',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-consequence-service.mjs'
            );

        assert.doesNotMatch(
            code,
            /update\(\s*\{[^}]*ownership/su
        );

        assert.doesNotMatch(
            code,
            /ownership\s*:/u
        );
    }
);

test(
    'Marca aparece no fluxo de finalização e não no roteamento puro',
    async () => {
        const service =
            await source(
                'scripts/dual-soul-consequence-service.mjs'
            );

        assert.match(
            service,
            /finalizeDualSoulPossession/
        );

        assert.match(
            service,
            /system\.props\.arma_marcas_demonio/
        );

        assert.match(
            service,
            /markAfter\s*=\s*markBefore\s*\+\s*1/
        );

        assert.match(
            service,
            /finalizationId/
        );
    }
);

test(
    'Resistência bloqueia consequência ainda ativa',
    async () => {
        const code =
            await source(
                'scripts/dual-soul-awakening-resistance-service.mjs'
            );

        assert.match(
            code,
            /hasActiveDualSoulConsequence/
        );

        assert.match(
            code,
            /consequência de Dupla Alma ainda está ativa/
        );
    }
);

test(
    'runtime de Possessão é registrado no ready',
    async () => {
        const main =
            await source(
                'scripts/main.mjs'
            );

        assert.match(
            main,
            /registerDualSoulConsequenceRuntime/
        );

        assert.match(
            main,
            /openDualSoulConsequenceManager/
        );

        assert.match(
            main,
            /finalizeDualSoulPossession/
        );
    }
);

test(
    'macro e painel CSB chamam Consequence Manager',
    async () => {
        const builder =
            await source(
                'tools/build-macro-sources.mjs'
            );

        assert.match(
            builder,
            /NADualSoulCon001/
        );

        assert.match(
            builder,
            /na-resolver-consequencia-dual-soul\.js/
        );

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
                typeof node !==
                    'object'
            ) {
                return null;
            }

            if (
                node.key === key
            ) {
                return node;
            }

            if (
                Array.isArray(node)
            ) {
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
                    typeof value ===
                        'object'
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
                'dupla_alma_consequencia_ui'
            );

        assert.ok(panel);

        assert.equal(
            panel.visibilityFormula,
            'equalText(arma_categoria, "especial")'
        );

        assert.match(
            JSON.stringify(panel),
            /openDualSoulConsequenceManager/
        );
    }
);