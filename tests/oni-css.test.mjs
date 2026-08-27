import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');

describe('CSS — skin própria .na-oni-sheet', () => {
    it('declara o token da paleta Oni escopado dentro de .na-oni-sheet, nunca em :root global', () => {
        const rootBlockMatch = css.match(/:root\s*{[^}]*}/);
        assert.ok(rootBlockMatch, ':root global deve existir (paleta Slayer compartilhada)');
        for (const token of ['--oni-bg', '--oni-red', '--oni-pdk', '--oni-panel', '--oni-line']) {
            assert.doesNotMatch(
                rootBlockMatch[0],
                new RegExp(token),
                `${token} vazou para :root global`
            );
        }
        const oniRootMatch = css.match(/\.na-oni-sheet\s*{[^}]*}/);
        assert.ok(oniRootMatch, '.na-oni-sheet { ... } deve declarar a paleta');
        for (const token of [
            '--oni-bg',
            '--oni-red',
            '--oni-red-dark',
            '--oni-pdk',
            '--oni-panel',
            '--oni-line',
            '--oni-text',
        ]) {
            assert.match(oniRootMatch[0], new RegExp(token), `${token} ausente em .na-oni-sheet`);
        }
    });

    it('estiliza header/tabs/inputs/panels/cards especificamente sob .na-oni-sheet', () => {
        for (const selector of [
            '.na-oni-sheet .window-header',
            '.na-oni-sheet .window-content',
            '.na-oni-sheet nav.custom-tabs',
            '.na-oni-sheet .custom-tabs a.item.active',
            '.na-oni-sheet .custom-system-panel',
            ".na-oni-sheet input[type='text']",
            '.na-oni-sheet button',
        ]) {
            assert.ok(css.includes(selector), `seletor ausente: ${selector}`);
        }
    });

    it('PDV é vermelho sangue e PDK é vinho/magenta — identidades distintas do PDR do Slayer', () => {
        const pdvFill = css.match(/\.na-oni-sheet[^{]*\[class\*='pdv'\][^{]*{[^}]*}/);
        const pdkFill = css.match(/\.na-oni-sheet \[class\*='pdk'\][^{]*{[^}]*}/);
        assert.ok(pdvFill, 'meter fill de PDV específico do Oni deve existir');
        assert.ok(pdkFill, 'meter fill de PDK específico do Oni deve existir');
        assert.match(pdvFill[0], /--oni-red/);
        assert.match(pdkFill[0], /--oni-pdk/);
        assert.notEqual(pdvFill[0], pdkFill[0]);
    });

    it('possui classes de card Kekkijutsu (badge de PDK, rank, ação, origem, lista)', () => {
        for (const cls of [
            '.na-kekki-card',
            '.na-kekki-badge-pdk',
            '.na-kekki-badge-rank',
            '.na-kekki-badge-action',
            '.na-kekki-origin',
            '.na-kekki-list',
        ]) {
            assert.ok(
                css.includes(`.na-oni-sheet ${cls}`),
                `classe Kekkijutsu ausente sob .na-oni-sheet: ${cls}`
            );
        }
    });

    it('não altera nenhuma regra existente do Slayer (.na-sheet permanece intacto)', () => {
        // A skin Slayer usa a classe genérica `.na-sheet` — garantimos que ela
        // continua existindo com seu bloco de paleta original (--na-gold etc.)
        // e que nenhuma variável --oni- aparece dentro de blocos `.na-sheet {`
        // (a classe compartilhada, não `.na-oni-sheet`).
        const slayerSheetBlock = css.match(/(?<!-oni)\.na-sheet\s*{[^}]*}/);
        assert.ok(
            slayerSheetBlock,
            '.na-sheet { ... } (chrome compartilhado) deve continuar existindo'
        );
        assert.match(slayerSheetBlock[0], /--na-gold|--color-text-primary/);
        for (const token of ['--oni-bg', '--oni-red', '--oni-pdk']) {
            assert.doesNotMatch(slayerSheetBlock[0], new RegExp(token));
        }
        assert.ok(
            css.includes('--na-gold: #ffd700'),
            'paleta dourada original do Slayer preservada'
        );
        assert.ok(css.includes('--na-cyan: #15d7e6'), 'cor de PDR (cyan) do Slayer preservada');
    });
});
