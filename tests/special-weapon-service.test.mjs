import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    isSpecialWeaponAwakened,
    normalizeYamatoSide,
    rankAtLeast,
    yamatoOrochiBonusState,
} from '../scripts/special-weapon-service.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Yamato normaliza lado ativo', () => {
    assert.equal(normalizeYamatoSide('Forseti'), 'forseti');
    assert.equal(normalizeYamatoSide('Yamata no Orochi'), 'orochi');
    assert.equal(normalizeYamatoSide('definido pelo Teste 1 da Cerimônia'), '');
});

test('Yamato só usa habilidades do despertar fora do estado selado', () => {
    assert.equal(isSpecialWeaponAwakened({ arma_especial_estado_atual: 'Selada' }), false);
    assert.equal(isSpecialWeaponAwakened({ arma_especial_estado_atual: 'Selado' }), false);
    assert.equal(
        isSpecialWeaponAwakened({ arma_especial_estado_atual: 'Primeiro Despertar' }),
        true
    );
    assert.equal(
        isSpecialWeaponAwakened({ arma_especial_estado_atual: 'Despertar Verdadeiro' }),
        true
    );
});

test('tabela mecânica de Oito Gargantas segue as Marcas do Demônio', () => {
    assert.deepEqual(yamatoOrochiBonusState(0), { marks: 0, bonus: 1, wound: 0 });
    assert.deepEqual(yamatoOrochiBonusState(2), { marks: 2, bonus: 2, wound: 1 });
    assert.deepEqual(yamatoOrochiBonusState(4), { marks: 4, bonus: 3, wound: 1 });
    assert.deepEqual(yamatoOrochiBonusState(6), { marks: 6, bonus: 4, wound: 2 });
    assert.deepEqual(yamatoOrochiBonusState(7), { marks: 7, bonus: 5, wound: 2 });
});

test('Corte do Julgamento é liberado a partir do Rank B', () => {
    assert.equal(rankAtLeast('C', 'B'), false);
    assert.equal(rankAtLeast('B', 'B'), true);
    assert.equal(rankAtLeast('SS', 'B'), true);
});

test('fonte da Yamato separa contador de Marcas da tabela de regras', () => {
    const source = JSON.parse(
        fs.readFileSync(
            path.join(
                repoRoot,
                'data',
                'catalog-source',
                'weapons',
                'especiais',
                'yamato-weapon.json'
            ),
            'utf8'
        )
    );
    const props = source.system.props;
    assert.equal(props.arma_marcas_demonio, 0);
    assert.equal(typeof props.arma_marcas_demonio_tabela, 'object');
    assert.equal(props.arma_marcas_demonio_tabela['7+'].includes('Desvantagem'), true);
});

test('template especial expõe ataque runtime e painel de habilidades', () => {
    const template = JSON.parse(
        fs.readFileSync(
            path.join(repoRoot, 'src', 'templates', 'items', 'special-slayer-weapon-template.json'),
            'utf8'
        )
    );
    const serialized = JSON.stringify(template);
    assert.match(serialized, /rollSpecialWeaponItem/);
    assert.match(serialized, /openSpecialWeaponAbilities/);
    assert.match(serialized, /arma_especial_habilidades_ui/);
    assert.match(serialized, /arma_marcas_demonio_tabela_json/);
});

test('builder publica contratos runtime especiais', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'tools', 'build-weapon-sources.mjs'),
        'utf8'
    );
    for (const key of [
        'arma_especial_habilidades_json',
        'arma_especial_rank_effects_json',
        'arma_especial_integracao_json',
        'dupla_alma_vinculo_json',
        'dupla_alma_cerimonia_json',
        'arma_marcas_demonio_tabela_json',
    ]) {
        assert.match(source, new RegExp(key));
    }
});

test('hit-service aceita bônus/ação/perfil forçados pelo runtime especial', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'hit-service.mjs'), 'utf8');
    assert.match(source, /options\.bonus/);
    assert.match(source, /options\.forceActionType/);
    assert.match(source, /options\.requiredWeaponProfileIndex/);
});

test('damage-service injeta e consome pending de arma especial', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'damage-service.mjs'), 'utf8');
    assert.match(source, /specialWeaponPendingForAttack/);
    assert.match(source, /applySpecialWeaponHitEffects/);
    assert.match(source, /clearSpecialWeaponPending/);
    assert.match(source, /specialWeaponItem/);
    assert.match(source, /availableModes\.length > 1 && !specialWeaponItem/);
});


test('main registra e expõe o runtime especial', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'main.mjs'), 'utf8');
    assert.match(source, /registerSpecialWeaponRuntime/);
    assert.match(source, /openSpecialWeaponAbilities/);
    assert.match(source, /rollSpecialWeaponItem/);
    assert.match(source, /useSpecialWeaponAbility/);
});

test('damage-service delega ataque com pending para o runtime especial', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'damage-service.mjs'), 'utf8');
    assert.match(source, /const specialPending = specialWeaponPendingForAttack\(actor, item\)/);
    assert.match(source, /rollSpecialWeaponItem/);
});
