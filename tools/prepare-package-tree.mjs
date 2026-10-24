import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_ENTRIES = Object.freeze([
    'module.json',
    'scripts',
    'catalogs',
    'styles',
    'lang',
    'packs',
    'README.md',
    'CHANGELOG.md',
]);
/** Pastas de `assets/` que seguem no pacote. Só `icons` passa pela otimização do ffmpeg. */
export const PACKAGE_ASSET_DIRS = Object.freeze(['icons', 'fonts']);
/**
 * Arquivos que só as ferramentas de build leem. Ficam no repositório e fora do
 * pacote: `breathing.json` pesa 2,35 MB e o runtime nunca o carrega (os Itens de
 * Respiração já saem prontos nos packs).
 */
export const PACKAGE_BUILD_ONLY = Object.freeze(['catalogs/breathing.json']);
async function webpFiles(directory) {
    const result = [];
    for (const entry of await readdir(directory, {
        withFileTypes: true,
    })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...(await webpFiles(full)));
        else if (entry.name.toLowerCase().endsWith('.webp')) result.push(full);
    }
    return result;
}
export async function preparePackageTree({ ffmpeg = 'ffmpeg' } = {}) {
    const output = path.join(root, 'build', 'package');
    await rm(output, {
        recursive: true,
        force: true,
    });
    await mkdir(path.join(output, 'assets'), {
        recursive: true,
    });
    for (const entry of PACKAGE_ENTRIES) {
        await cp(path.join(root, entry), path.join(output, entry), {
            recursive: true,
        });
    }
    for (const dir of PACKAGE_ASSET_DIRS) {
        await cp(path.join(root, 'assets', dir), path.join(output, 'assets', dir), {
            recursive: true,
        });
    }
    for (const file of PACKAGE_BUILD_ONLY) {
        await rm(path.join(output, file), {
            force: true,
        });
    }
    const icons = await webpFiles(path.join(output, 'assets', 'icons'));
    for (const icon of icons) {
        const temporary = `${icon}.optimized.webp`;
        const result = spawnSync(
            ffmpeg,
            [
                '-hide_banner',
                '-loglevel',
                'error',
                '-y',
                '-i',
                icon,
                '-vf',
                'scale=512:512:force_original_aspect_ratio=decrease',
                '-c:v',
                'libwebp',
                '-quality',
                '82',
                '-compression_level',
                '6',
                '-preset',
                'icon',
                temporary,
            ],
            {
                stdio: 'inherit',
            }
        );
        if (result.status !== 0) throw new Error(`Falha ao otimizar ${icon}.`);
        await cp(temporary, icon, {
            force: true,
        });
        await rm(temporary, {
            force: true,
        });
    }
    console.log(`Árvore de pacote preparada com ${icons.length} ícones otimizados: ${output}`);
    return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await preparePackageTree();
}
