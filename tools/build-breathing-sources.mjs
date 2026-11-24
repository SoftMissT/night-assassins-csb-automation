import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breathingIconPath } from '../scripts/breathing-icons.mjs';
import { flameFormById } from '../scripts/flame-breathing-data.mjs';
import { stoneFormById } from '../scripts/stone-breathing-data.mjs';
import { mistFormById } from '../scripts/mist-breathing-data.mjs';
import { metalFormById } from '../scripts/metal-breathing-data.mjs';
import { snowFormById } from '../scripts/snow-breathing-data.mjs';
import { markdownToFoundryHtml, writeFileIfChanged } from './compendium-catalog-utils.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'catalogs', 'breathing.json');
const outputDirectory = path.join(root, 'build', 'compendium', 'respiracoes');
const internalCatalogPath = path.join(root, 'catalogs', 'breathing-items.json');
const templatePath = path.join(root, 'src', 'templates', 'items', 'breathing-form-template.json');
export const BREATHING_CATALOG = Object.freeze([
    'Água',
    'Ameixeira',
    'Amor',
    'Aranha',
    'Areia',
    'Besta',
    'Cerejeira',
    'Chamas',
    'Corvo',
    'Cristal',
    'Dragão',
    'Eclipse',
    'Estrelas',
    'Flores',
    'Grama',
    'Insetos',
    'Lobo',
    'Lua',
    'Luz',
    'Macaco',
    'Madeira',
    'Magma',
    'Metal',
    'Neve',
    'Nevasca',
    'Névoa',
    'Pedra',
    'Raposa',
    'Sangue',
    'Serpente',
    'Sol',
    'Som',
    'Sombras',
    'Sonhos',
    'Tartaruga',
    'Tempo',
    'Tigre',
    'Tinta',
    'Tormenta',
    'Trovão',
    'Tubarão',
    'Vagalume',
    'Veneno',
    'Vento',
]);
export const BREATHING_FOLDER_NAMES = Object.freeze([
    'Respiração da Água',
    'Respiração da Ameixeira',
    'Respiração do Amor',
    'Respiração da Aranha',
    'Respiração da Areia',
    'Respiração da Besta',
    'Respiração da Cerejeira',
    'Respiração das Chamas',
    'Respiração do Corvo',
    'Respiração do Cristal',
    'Respiração do Dragão',
    'Respiração do Eclipse',
    'Respiração das Estrelas',
    'Respiração das Flores',
    'Respiração da Grama',
    'Respiração dos Insetos',
    'Respiração do Lobo',
    'Respiração da Lua',
    'Respiração da Luz',
    'Respiração do Macaco',
    'Respiração da Madeira',
    'Respiração do Magma',
    'Respiração do Metal',
    'Respiração da Neve',
    'Respiração da Nevasca',
    'Respiração da Névoa',
    'Respiração da Pedra',
    'Respiração da Raposa',
    'Respiração do Sangue',
    'Respiração da Serpente',
    'Respiração do Sol',
    'Respiração do Som',
    'Respiração das Sombras',
    'Respiração dos Sonhos',
    'Respiração da Tartaruga',
    'Respiração do Tempo',
    'Respiração do Tigre',
    'Respiração da Tinta',
    'Respiração da Tormenta',
    'Respiração do Trovão',
    'Respiração do Tubarão',
    'Respiração do Vagalume',
    'Respiração do Veneno',
    'Respiração do Vento',
]);
/**
 * O catálogo mecânico (`catalogs/breathing.json`) contém dados de todas as
 * Respirações do jogo, mas o pacote distribuído publica apenas as Respirações
 * com motor dedicado e auditoria concluída. Todas seguem o mesmo molde: uma pasta por
 * Respiração, com as Formas dentro (sem item painel nem pasta técnica).
 */
export const PUBLISHED_BREATHINGS = Object.freeze([
    'Água',
    'Chamas',
    'Eclipse',
    'Metal',
    'Neve',
    'Névoa',
    'Pedra',
    'Raposa',
    'Som',
    'Sonhos',
    'Vento',
]);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.format !== 1 || !Array.isArray(catalog.documents))
    throw new Error('Catálogo mecânico de Respirações inválido.');
{
    const publishedItems = catalog.documents.filter(
        (document) =>
            document.type === 'equippableItem' &&
            PUBLISHED_BREATHINGS.includes(document.system?.props?.respiracao_nome ?? '')
    );
    const publishedFolderIds = new Set(publishedItems.map((item) => item.folder).filter(Boolean));
    catalog.documents = catalog.documents.filter((document) => {
        if (document.type === 'equippableItem')
            return PUBLISHED_BREATHINGS.includes(document.system?.props?.respiracao_nome ?? '');
        if (document.type === 'Item') return publishedFolderIds.has(document._id);
        return true;
    });
}
const templateExport = JSON.parse(await readFile(templatePath, 'utf8'));
const breathingTemplate = templateExport.items?.find(
    (item) => item.type === '_equippableItemTemplate' && item.id === 'NABreathTpl00001'
);
if (!breathingTemplate) throw new Error('Template de Forma de Respiração inválido.');
const templateDocument = {
    _id: breathingTemplate.id,
    _key: `!items!${breathingTemplate.id}`,
    name: breathingTemplate.name,
    type: breathingTemplate.type,
    img: breathingTemplate.img,
    system: breathingTemplate.data,
};
catalog.documents = catalog.documents.map((document) =>
    document.type === '_equippableItemTemplate' && document._id === templateDocument._id
        ? templateDocument
        : document
);
for (const document of catalog.documents) {
    if (document.type !== 'equippableItem') continue;
    document.name = String(document.name ?? '').replace(/\s+[—–]\s+/gu, ': ');
    const icon = breathingIconPath(document.system?.props?.respiracao_nome);
    if (icon) document.img = icon;
    const flame = flameFormById(document.system?.props?.forma_id);
    const stone = stoneFormById(document.system?.props?.forma_id);
    const mist = mistFormById(document.system?.props?.forma_id);
    const metal = metalFormById(document.system?.props?.forma_id);
    const snow = snowFormById(document.system?.props?.forma_id);
    const props = document.system.props;
    props.forma_passiva =
        stone?.passiva ||
        flame?.passive ||
        ['metal_05', 'neve_08'].includes(String(props.forma_id ?? '')) ||
        /passiva/iu.test(String(props.tipo_manobra ?? ''))
            ? 1
            : 0;
    if (flame) {
        document.system.props.tipo_manobra = flame.passive
            ? 'Passiva'
            : ({
                  ataque: 'Ação de Ataque',
                  especial: 'Ação Especial',
                  reacao: 'Reação',
                  unica: 'Ação Única',
              }[flame.action] ?? flame.action);
        for (let level = 1; level <= 4; level += 1) {
            const mechanics = flame.levels[level - 1];
            document.system.props[`tem_nvl${level}`] = mechanics ? 1 : 0;
            document.system.props[`nvl${level}_custo`] = mechanics?.cost ?? 0;
            document.system.props[`nvl${level}_dano`] = mechanics?.damage ?? '';
            document.system.props[`nvl${level}_tipos_dano`] = Array.isArray(flame.damageTypes)
                ? flame.damageTypes.join(',')
                : '';
            document.system.props[`nvl${level}_status`] = '';
            document.system.props[`nvl${level}_buff`] = '';
        }
    }
    const curated = stone ?? mist ?? metal ?? snow;
    if (curated) {
        if (stone) {
            document.name = `${props.respiracao_nome} ${stone.ptName ?? stone.nome}`.trim();
            document.system.props.nome_forma = stone.ptName ?? stone.nome;
            document.system.props.nome_jp = stone.nome ?? '';
        }
        // Pedra usa o shape canônico (`acao`/`acoes`/`niveis[].custo/dano/tiposDano`);
        // mist/metal/snow seguem o formato legado (`action`/`actions`/`levels`).
        const action = stone
            ? (stone.acao ?? stone.acoes?.join(' + ') ?? '')
            : (curated.action ?? curated.actions?.join(' + ') ?? '');
        document.system.props.tipo_manobra =
            {
                ataque: 'Ação de Ataque',
                especial: 'Ação Especial',
                reacao: 'Reação',
                unica: 'Ação Única',
                completa: 'Ação Completa',
            }[action] ?? action;
        for (let level = 1; level <= 4; level += 1) {
            const mechanics = stone ? stone.niveis?.[level - 1] : curated.levels[level - 1];
            document.system.props[`tem_nvl${level}`] = mechanics ? 1 : 0;
            document.system.props[`nvl${level}_custo`] = mechanics?.custo ?? mechanics?.cost ?? 0;
            document.system.props[`nvl${level}_dano`] =
                mechanics?.dano ?? mechanics?.damage ?? mechanics?.bonus ?? '';
            const types = mechanics?.tiposDano ?? mechanics?.damageTypes;
            document.system.props[`nvl${level}_tipos_dano`] = Array.isArray(types)
                ? types.join(',')
                : '';
        }
    }
    // Custos de nível precisam ser numéricos no Item publicado; o catálogo de
    // algumas Respirações (ex.: Vento) usa rótulos livres ("variável", "-") e o
    // motor já trata o ausente como 0. Publicamos 0 para manter o campo são.
    for (let level = 1; level <= 4; level += 1) {
        const costKey = `nvl${level}_custo`;
        if (props[costKey] !== undefined && !Number.isFinite(Number(props[costKey])))
            props[costKey] = 0;
    }
    const richTextKeys = [
        'descricao',
        'requisito_texto',
        'gatilho_texto',
        'combo_texto',
        'notas_texto',
        'sinergias_texto',
        'nvl1_efeito',
        'nvl2_efeito',
        'nvl3_efeito',
        'nvl4_efeito',
    ];
    for (const key of richTextKeys) {
        if (typeof props[key] === 'string' && props[key].trim())
            props[key] = markdownToFoundryHtml(props[key]);
    }
}
const internalCatalog = {
    format: 1,
    generatedBy: 'tools/build-breathing-sources.mjs',
    documents: catalog.documents.filter((document) => document._id !== templateDocument._id),
};
await writeFileIfChanged(internalCatalogPath, `${JSON.stringify(internalCatalog, null, 2)}\n`);
const packDocuments = catalog.documents;
if (!packDocuments.some((document) => document._id === templateDocument._id))
    throw new Error('Template de Forma ausente do pack.');
await rm(outputDirectory, {
    recursive: true,
    force: true,
});
await mkdir(outputDirectory, {
    recursive: true,
});
await Promise.all(
    packDocuments.map((document, index) => {
        const id = document._id ?? `document-${index}`;
        const kind = document.type === 'Item' ? 'folder' : 'item';
        return writeFile(
            path.join(outputDirectory, `${String(index).padStart(4, '0')}-${kind}-${id}.json`),
            `${JSON.stringify(document, null, 2)}\n`
        );
    })
);
const folderCount = internalCatalog.documents.filter((document) => document.type === 'Item').length;
const itemCount = internalCatalog.documents.filter(
    (document) => document._key?.startsWith('!items!') && document.type !== 'Item'
).length;
console.info(
    `Pack de Respirações: ${packDocuments.length} documentos. Catálogo interno: ${itemCount} Items em ${folderCount} pastas.`
);
