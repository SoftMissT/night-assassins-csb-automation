import { MODULE_ID } from "./constants.mjs";

const PACK_ID = `${MODULE_ID}.night-assassins-macros`;
const FOLDER_NAME = "Night Assassins";
const GM_MACRO_NAME = "Night Assassins Controle GM";

function macroOwnership(name) {
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  return { default: name === GM_MACRO_NAME ? levels.NONE : levels.OBSERVER };
}

function worldMacroData(document, folderId) {
  const source = document.toObject();
  delete source._id;
  delete source._key;
  delete source._stats;

  return {
    ...source,
    folder: folderId,
    ownership: macroOwnership(document.name),
    flags: {
      ...(source.flags ?? {}),
      core: { ...(source.flags?.core ?? {}), sourceId: document.uuid },
      [MODULE_ID]: { managed: true, sourceId: document.uuid },
    },
  };
}

export async function syncCanonicalMacros() {
  if (!game.user?.isGM) return { created: 0, updated: 0, skipped: 0 };

  const pack = game.packs.get(PACK_ID);
  if (!pack) throw new Error(`Compendium ${PACK_ID} não encontrado.`);

  let folder = game.folders.find((entry) => entry.type === "Macro" && entry.name === FOLDER_NAME);
  if (!folder) folder = await Folder.create({ name: FOLDER_NAME, type: "Macro", sorting: "a" });

  const documents = await pack.getDocuments();
  const existingBySource = new Map();
  for (const macro of game.macros.contents) {
    const sourceId = macro.getFlag?.(MODULE_ID, "sourceId") ?? macro.flags?.[MODULE_ID]?.sourceId ?? macro.flags?.core?.sourceId;
    if (sourceId) existingBySource.set(sourceId, macro);
  }
  const updates = [];
  const missing = [];
  for (const document of documents) {
    const existing = existingBySource.get(document.uuid);
    if (!existing) {
      missing.push(document);
      continue;
    }
    const source = worldMacroData(document, existing.folder?.id ?? existing.folder ?? folder.id);
    updates.push({ _id: existing.id, name: source.name, type: source.type, scope: source.scope, command: source.command, img: source.img, flags: source.flags });
  }

  if (updates.length > 0) await Macro.updateDocuments(updates);

  if (missing.length > 0) {
    await Macro.createDocuments(missing.map((document) => worldMacroData(document, folder.id)));
  }

  return { created: missing.length, updated: updates.length, skipped: documents.length - missing.length - updates.length, folderId: folder.id };
}

export const CANONICAL_MACRO_PACK_ID = PACK_ID;
