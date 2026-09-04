import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    awakeningBloodCost,
    awakeningDuration,
    awakeningExpired,
    awakeningRuntime,
} from '../scripts/special-weapon-awakening-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Sangue na Bainha preserva 10% do PDV atual arredondado para cima', () => {
    assert.deepEqual(awakeningBloodCost(101), { current: 101, remaining: 11, cost: 90 });
    assert.deepEqual(awakeningBloodCost(10), { current: 10, remaining: 1, cost: 9 });
});

test('duração segue Dualidade, Simbiose, Unificação e Identidade', () => {
    assert.equal(awakeningDuration('Dualidade'), 2);
    assert.equal(awakeningDuration('Simbiose'), 3);
    assert.equal(awakeningDuration('Unificação'), 3);
    assert.equal(awakeningDuration('Identidade'), 4);
});

test('Primeiro Despertar expira automaticamente na rodada correta', () => {
    const runtime = awakeningRuntime({
        combatId: 'c1',
        round: 4,
        duration: 2,
        side: 'forseti',
        sideKind: 'entidade',
        sideName: 'Forseti',
        weaponId: 'yamato-1',
        weaponName: "Yamato The Rift-Walker's Legacy",
        ritualName: 'Sangue na Bainha',
    });
    assert.equal(awakeningExpired(runtime, { id: 'c1', round: 5 }), false);
    assert.equal(awakeningExpired(runtime, { id: 'c1', round: 6 }), true);
    assert.equal(runtime.sideKind, 'entidade');
    assert.equal(runtime.sideName, 'Forseti');
    assert.equal(runtime.ritualName, 'Sangue na Bainha');
});

test('main e template expõem o manager nativo sem injeção DOM', () => {
    const main = fs.readFileSync(path.join(root, 'scripts', 'main.mjs'), 'utf8');
    const template = fs.readFileSync(path.join(root, 'src', 'templates', 'items', 'special-slayer-weapon-template.json'), 'utf8');
    assert.match(main, /registerSpecialWeaponAwakeningRuntime/);
    assert.match(main, /openSpecialWeaponAwakeningManager/);
    assert.match(template, /GERENCIAR DESPERTAR/);
    assert.match(template, /HABILIDADES DA YAMATO/);
    assert.doesNotMatch(main, /prepend\(/);
});

test('Primeiro Despertar é genérico e mantém o alias Yamato', () => {
    const service = fs.readFileSync(
        path.join(root, 'scripts', 'special-weapon-awakening-service.mjs'),
        'utf8'
    );
    assert.match(service, /export async function awakenSpecialWeapon/);
    assert.match(service, /export async function awakenYamato/);
    assert.match(service, /isDualSoulWeapon\(item\)/);
    assert.match(service, /sideKind:/);
    assert.doesNotMatch(service, /function isYamato/);
});

test('macro canônica retira qualquer Arma de Dupla Alma do selamento', () => {
    const macro = fs.readFileSync(
        path.join(root, 'macros', 'na-despertar-arma-dual-soul.js'),
        'utf8'
    );
    const builder = fs.readFileSync(
        path.join(root, 'tools', 'build-macro-sources.mjs'),
        'utf8'
    );
    assert.match(macro, /awakenSpecialWeapon/);
    assert.match(builder, /na-despertar-arma-dual-soul\.js/);
    assert.match(builder, /NADualSoulAwk001/);
});

test('as 17 fontes especiais definem Estado Selado, Primeiro Despertar e Ritual', () => {
    const directory = path.join(root, 'data', 'catalog-source', 'weapons', 'especiais');
    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'));
    assert.equal(files.length, 17);
    for (const file of files) {
        const document = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        const props = document.system?.props ?? {};
        assert.ok(props.arma_despertar?.estado_selado, `${document.name}: estado selado ausente`);
        assert.ok(
            Array.isArray(props.arma_despertar?.estado_selado_regras) &&
                props.arma_despertar.estado_selado_regras.length > 0,
            `${document.name}: permissões do estado selado ausentes`
        );
        assert.ok(
            props.arma_despertar?.primeiro_despertar,
            `${document.name}: primeiro despertar ausente`
        );
        assert.ok(props.arma_ritual?.nome, `${document.name}: ritual ausente`);
        assert.ok(props.arma_ritual?.custo, `${document.name}: custo ausente`);
    }
});

test('o build faz todas as 17 armas nascerem Seladas em sua forma canônica', () => {
    const directory = path.join(root, 'build', 'compendium', 'armas-slayer');
    const weapons = fs.readdirSync(directory)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')))
        .filter((document) => document.system?.props?.arma_categoria === 'especial');

    assert.equal(weapons.length, 17);
    for (const weapon of weapons) {
        const props = weapon.system.props;
        const awakening = props.arma_despertar;
        const states = JSON.parse(props.arma_especial_estados_json);
        assert.equal(props.arma_especial_estado_atual, 'Selado', `${weapon.name}: estado inicial`);
        assert.equal(
            props.arma_especial_forma_atual,
            awakening.estado_selado,
            `${weapon.name}: forma selada`
        );
        assert.equal(states[0]?.id, 'selado', `${weapon.name}: runtime selado`);
        assert.deepEqual(states[0]?.regras, awakening.estado_selado_regras);
        assert.equal(states[0]?.bloqueios?.length, 2, `${weapon.name}: bloqueios espirituais`);
    }
});
