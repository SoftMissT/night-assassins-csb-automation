import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const MODULE_ID = 'night-assassins-csb-automation';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'macros');
const outputDirectory = path.join(root, 'build', 'compendium', 'macros');
const MACRO_FOLDERS = Object.freeze([
    {
        id: 'NAMacroCombat001',
        name: 'Combate',
    },
    {
        id: 'NAMacroBreath001',
        name: 'Respirações',
    },
    {
        id: 'NAMacroSheet0001',
        name: 'Ficha Slayer',
    },
    {
        id: 'NAMacroGMTool001',
        name: 'GM e Manutenção',
    },
]);
const folderFor = (file) => {
    if (['na-roll-mode.js', 'na-acerto-roll.js', 'na_roll_damage.js'].includes(file))
        return 'NAMacroCombat001';
    if (
        [
            'na-resp-usar-forma.js',
            'na-respiracao-recuperacao.js',
        ].includes(file)
    )
        return 'NAMacroBreath001';
    if (
        [
            'na-marca-cacador.js',
            'na-gerenciar-acoes.js',
            'na-gerenciar-descanso.js',
            'na-gerenciar-estados-avancados.js',
            'na-gerenciar-resistencias.js',
            'na-gerenciar-status.js',
            'na-gerenciar-vida-morte.js',
        ].includes(file)
    )
        return 'NAMacroSheet0001';
    return 'NAMacroGMTool001';
};

function macroIconPath(file, icon = '') {
    if (icon.includes('/')) return `modules/${MODULE_ID}/assets/icons/${icon}`;
    return `modules/${MODULE_ID}/assets/icons/macros/${icon || `${path.basename(file, '.js')}_icon.webp`}`;
}
const macros = [
    {
        id: 'NARollMode000001',
        file: 'na-roll-mode.js',
        name: 'Night Assassins Teste de Atributo',
    },
    {
        id: 'NAHitRoll0000001',
        file: 'na-acerto-roll.js',
        name: 'Night Assassins Rolagem de Acerto',
    },
    {
        id: 'NADamageRoll0001',
        file: 'na_roll_damage.js',
        name: 'Night Assassins Rolagem de Dano',
    },
    {
        id: 'NAHunterMark0001',
        file: 'na-marca-cacador.js',
        name: 'Night Assassins Marca do Caçador',
    },
    {
        id: 'NAGMControl00001',
        file: 'na-gm-control.js',
        name: 'Night Assassins Controle GM',
    },
    {
        id: 'NAResistance0001',
        file: 'na-gerenciar-resistencias.js',
        name: 'Night Assassins Gerenciar Resistências',
    },
    {
        id: 'NAStatusManage01',
        file: 'na-gerenciar-status.js',
        name: 'Night Assassins Gerenciar Status',
    },
    {
        id: 'NAActionManage01',
        file: 'na-gerenciar-acoes.js',
        name: 'Night Assassins Gerenciar Ações',
    },
    {
        id: 'NARestManage0001',
        file: 'na-gerenciar-descanso.js',
        name: 'Night Assassins Gerenciar Descanso',
    },
    {
        id: 'NARecovery000001',
        file: 'na-respiracao-recuperacao.js',
        name: 'Night Assassins Respiração da Recuperação',
        icon: 'na-gerenciar-acoes_icon.webp',
    },
    {
        id: 'NARespFormUse001',
        file: 'na-resp-usar-forma.js',
        name: 'Night Assassins Usar Forma de Respiração',
    },
    {
        id: 'NALifeDeath00001',
        file: 'na-gerenciar-vida-morte.js',
        name: 'Night Assassins Vida e Morte',
    },
    {
        id: 'NAAdvStates00001',
        file: 'na-gerenciar-estados-avancados.js',
        name: 'Night Assassins Estados Avançados',
    },
];
await rm(outputDirectory, {
    recursive: true,
    force: true,
});
await mkdir(outputDirectory, {
    recursive: true,
});
for (const [index, folder] of MACRO_FOLDERS.entries()) {
    await writeFile(
        path.join(outputDirectory, `${String(index).padStart(2, '0')}-folder-${folder.id}.json`),
        `${JSON.stringify(
            {
                _key: `!folders!${folder.id}`,
                _id: folder.id,
                name: folder.name,
                type: 'Macro',
                sorting: 'a',
                folder: null,
                sort: (index + 1) * 100000,
                color: null,
                flags: {},
            },
            null,
            2
        )}\n`
    );
}
for (const [index, macro] of macros.entries()) {
    if (macro.id.length !== 16) throw new Error(`ID inválido para ${macro.file}: ${macro.id}`);
    const command = await readFile(path.join(sourceDirectory, macro.file), 'utf8');
    const document = {
        _key: `!macros!${macro.id}`,
        _id: macro.id,
        name: macro.name,
        type: 'script',
        author: null,
        img: macroIconPath(macro.file, macro.icon),
        scope: 'global',
        command,
        folder: folderFor(macro.file),
        sort: (index + 1) * 100000,
        ownership: {
            default: [
                'Night Assassins Controle GM',
                'Night Assassins Diagnóstico de Erros',
                'Night Assassins Diagnosticar Armas Duplicadas',
            ].includes(macro.name)
                ? 0
                : 2,
        },
        flags: {},
        _stats: {
            systemId: 'custom-system-builder',
            systemVersion: '6.0.2',
            coreVersion: '14',
            createdTime: 0,
            modifiedTime: 0,
            lastModifiedBy: null,
        },
    };
    const outputName = `${String(index + 1).padStart(2, '0')}-${path.basename(macro.file, '.js')}.json`;
    await writeFile(
        path.join(outputDirectory, outputName),
        `${JSON.stringify(document, null, 2)}\n`
    );
}
console.log(`Preparadas ${macros.length} macros para o Compendium.`);
