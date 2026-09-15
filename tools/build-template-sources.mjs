import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folders = Object.freeze([
    { id: 'NATplSlayer00001', name: 'Slayer', type: 'Actor' },
    { id: 'NATplOni00000001', name: 'Oni', type: 'Actor' },
    { id: 'NATplMinion00001', name: 'Oni Minion', type: 'Actor' },
    { id: 'NATplNpc00000001', name: 'NPC', type: 'Actor' },
]);
const templates = [
    {
        file: 'src/templates/actors/slayer-template.json',
        id: 'NASlayerTpl00001',
        folder: 'NATplSlayer00001',
    },
    {
        file: 'src/templates/actors/oni-template.json',
        id: 'NAOniTemplate001',
        folder: 'NATplOni00000001',
    },
    {
        file: 'src/templates/actors/oni-minion-template.json',
        id: 'NAOniMinionTpl01',
        folder: 'NATplMinion00001',
    },
    {
        file: 'src/templates/actors/npc-template.json',
        id: 'NANpcTemplate001',
        folder: 'NATplNpc00000001',
    },
];

const outputDirectory = path.join(root, 'build', 'compendium', 'templates-de-ficha');
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const [index, folder] of folders.entries()) {
    await writeFile(
        path.join(outputDirectory, `${String(index).padStart(2, '0')}-folder-${folder.id}.json`),
        `${JSON.stringify({
            _id: folder.id,
            _key: `!folders!${folder.id}`,
            name: folder.name,
            type: folder.type,
            sorting: 'a',
            folder: null,
            sort: index * 100000,
            color: null,
            flags: {},
        }, null, 2)}\n`
    );
}

for (const template of templates) {
    if (template.id.length !== 16)
        throw new Error(`ID inválido para ${template.file}: ${template.id}`);
    const source = JSON.parse(await readFile(path.join(root, template.file), 'utf8'));
    source._id = template.id;
    source._key = `!actors!${template.id}`;
    source.folder = template.folder;
    source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name };
    source._stats = {
        ...(source._stats ?? {}),
        systemId: 'custom-system-builder',
        systemVersion: '6.0.2',
        coreVersion: '14',
        createdTime: 0,
        modifiedTime: 0,
        lastModifiedBy: null,
        compendiumSource: null,
    };

    await writeFile(
        path.join(outputDirectory, `${template.id}.json`),
        `${JSON.stringify(source, null, 2)}\n`
    );
}

console.log('Preparados os templates Slayer, Oni, Oni Minion e NPC para o Compêndio unificado.');
