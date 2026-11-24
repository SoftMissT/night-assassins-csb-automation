import assert from 'node:assert/strict';
import test from 'node:test';
import { pooledSequenceDamageFormula } from '../scripts/fantasia-final-pool.mjs';

const hit = (critical = false) => ({ hit: true, critical });
const miss = () => ({ hit: false, critical: false });

test('cada acerto soma os dados da Forma; a quantidade cresce com os acertos acumulados', () => {
    assert.equal(pooledSequenceDamageFormula('4d4', [hit(), hit(), hit()]), '12d4');
    assert.equal(pooledSequenceDamageFormula('6d4', [hit(), hit()]), '12d4');
});

test('erros não entram no pool', () => {
    assert.equal(pooledSequenceDamageFormula('4d4', [hit(), miss(), miss(), hit()]), '8d4');
});

test('acerto crítico dobra os dados daquele acerto e a sequência segue', () => {
    assert.equal(pooledSequenceDamageFormula('4d4', [hit(), hit(true), hit()]), '16d4');
    assert.equal(pooledSequenceDamageFormula('7d4', [hit(true), miss(), hit()]), '21d4');
});

test('sem acerto não há pool; dano que não é só dados não é somado aqui', () => {
    assert.equal(pooledSequenceDamageFormula('4d4', [miss(), miss(), miss()]), null);
    assert.equal(pooledSequenceDamageFormula('', [hit()]), null);
    assert.equal(pooledSequenceDamageFormula('4d4 + @car', [hit()]), null);
});
