import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { normalizeRankFormulas, RANK_DICE } from '../tools/build-weapon-sources.mjs';

describe('geração sistêmica de fórmulas por Rank', () => {
    it('gera uma fórmula por Rank para cada perfil de ataque', () => {
        const profiles = [
            { nome: 'Nunchaku', formula_texto: '4 + FOR ou DEX / Concussão' },
            { nome: 'Tridente', formula_texto: '4 + FOR ou DEX / Perfurante' },
            { nome: 'Mangual — Concussão', formula_texto: '5 + FOR ou DEX / Concussão' },
            { nome: 'Mangual — Cortante', formula_texto: '5 + FOR ou DEX / Cortante' },
        ];

        const formulas = normalizeRankFormulas({}, profiles);

        assert.equal(formulas.B.length, 4);
        assert.equal(formulas.B[0], '4 + FOR ou DEX + 1d10 / Concussão');
        assert.equal(formulas.B[3], '5 + FOR ou DEX + 1d10 / Cortante');
    });

    it('usa a tabela universal de dados evolutivos em todos os Ranks', () => {
        const profiles = [{ nome: 'Lâmina', formula_texto: '4 + FOR ou DEX / Cortante' }];
        const formulas = normalizeRankFormulas({}, profiles);

        for (const [rank, dice] of Object.entries(RANK_DICE)) {
            assert.ok(formulas[rank][0].includes(`+ ${dice} `), `Rank ${rank} deve usar ${dice}`);
        }
    });

    it('não duplica dado quando a fórmula extraída já tem dados evolutivos', () => {
        const profiles = [{ nome: 'Especial', formula_texto: '3 + FOR + 2d6 / Sagrado' }];
        const formulas = normalizeRankFormulas({}, profiles);

        assert.equal(formulas.A[0], '3 + FOR + 2d6 / Sagrado');
    });

    it("substitui o placeholder 'dado evolutivo' pelo dado real do Rank", () => {
        const profiles = [
            { nome: 'Nunchaku', formula_texto: '4 + FOR ou DEX + dado evolutivo / Concussão' },
        ];
        const formulas = normalizeRankFormulas({}, profiles);

        assert.equal(formulas.B[0], '4 + FOR ou DEX + 1d10 / Concussão');
        assert.ok(!formulas.B[0].includes('dado evolutivo'));
    });

    it('mantém extração do Markdown quando ela cobre todos os perfis', () => {
        const profiles = [
            { nome: 'A', formula_texto: '4 + DEX / Cortante' },
            { nome: 'B', formula_texto: '4 + DEX / Perfurante' },
        ];
        const extracted = { B: ['4 + DEX + 1d10 / Cortante', '6 + DEX + 1d10 / Perfurante'] };
        const formulas = normalizeRankFormulas(extracted, profiles);

        assert.deepEqual(formulas.B, extracted.B);
    });

    it('armas normais construídas não recebem fórmulas por Rank', async () => {
        const directory = new URL('../build/compendium/armas-slayer/', import.meta.url);
        const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
        let weaponsChecked = 0;

        for (const file of files) {
            const document = JSON.parse(
                await readFile(
                    new URL(`../build/compendium/armas-slayer/${file}`, import.meta.url),
                    'utf8'
                )
            );
            if (document.type !== 'equippableItem') continue;
            const props = document.system?.props ?? {};
            if (props.arma_categoria === 'especial') continue;
            const profiles = Array.isArray(props.arma_perfis_ataque)
                ? props.arma_perfis_ataque
                : [];
            if (profiles.length === 0) continue;
            weaponsChecked += 1;

            const formulas = JSON.parse(props.arma_formulas_por_rank_json);
            assert.deepEqual(formulas, {});
        }

        assert.equal(weaponsChecked, 4);
    });

    it('Rebellion recebe a progressão evolutiva D a SS', async () => {
        const directory = new URL('../build/compendium/armas-slayer/', import.meta.url);
        const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
        const documents = await Promise.all(
            files.map(async (file) =>
                JSON.parse(
                    await readFile(
                        new URL(`../build/compendium/armas-slayer/${file}`, import.meta.url),
                        'utf8'
                    )
                )
            )
        );
        const rebellion = documents.find((document) => document.name === 'Rebellion');
        assert.ok(rebellion);
        const formulas = JSON.parse(rebellion.system.props.arma_formulas_por_rank_json);
        assert.equal(formulas.D[0], '7 + FOR + 1d6 / Cortante ou Concussão');
        assert.equal(formulas.SS[0], '7 + FOR + 2d8 / Cortante ou Concussão');
    });

    it('todas as dezessete armas especiais preservam perfis e progressão D a SS', async () => {
        const directory = new URL('../build/compendium/armas-slayer/', import.meta.url);
        const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
        const documents = await Promise.all(
            files.map(async (file) =>
                JSON.parse(
                    await readFile(
                        new URL(`../build/compendium/armas-slayer/${file}`, import.meta.url),
                        'utf8'
                    )
                )
            )
        );
        const specialWeapons = documents.filter(
            (document) =>
                document.type === 'equippableItem' &&
                document.system?.props?.arma_categoria === 'especial'
        );

        assert.equal(specialWeapons.length, 17);
        for (const weapon of specialWeapons) {
            const props = weapon.system.props;
            assert.ok(props.arma_perfis_ataque.length > 0, `${weapon.name} deve possuir perfil`);
            const formulas = JSON.parse(props.arma_formulas_por_rank_json);
            for (const rank of Object.keys(RANK_DICE)) {
                assert.ok(
                    Array.isArray(formulas[rank]) && formulas[rank].length > 0,
                    `${weapon.name} deve possuir fórmula no Rank ${rank}`
                );
            }
        }
    });
});
