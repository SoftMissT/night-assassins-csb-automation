/**
 * Sincroniza os quatro templates canônicos do Compendium com os documentos
 * `_template` do World. O CSB não atualiza automaticamente templates já
 * importados quando o módulo é atualizado.
 */
import { MODULE_ID } from "./constants.mjs";

export const TEMPLATE_PACK_ID = `${MODULE_ID}.night-assassins-templates-de-ficha`;
export const CANONICAL_TEMPLATE_NAMES = Object.freeze([
  "slayer_template",
  "oni_template",
  "oni_minion_template",
  "npc_template",
]);

export function buildWorldTemplatePatch(canonical, version) {
  const source = canonical?.toObject ? canonical.toObject() : structuredClone(canonical ?? {});
  return {
    name: source.name,
    img: source.img,
    system: source.system,
    prototypeToken: source.prototypeToken,
    [`flags.${MODULE_ID}.templateSyncVersion`]: version,
  };
}

function templateVersion(actor) {
  return actor?.getFlag?.(MODULE_ID, "templateSyncVersion")
    ?? actor?.flags?.[MODULE_ID]?.templateSyncVersion
    ?? "";
}

export async function syncCanonicalActorTemplates({ version = game.modules.get(MODULE_ID)?.version ?? "dev" } = {}) {
  if (!game.user?.isGM) return { created: 0, updated: 0, skipped: 0 };
  const pack = game.packs.get(TEMPLATE_PACK_ID);
  if (!pack) throw new Error(`Compendium ${TEMPLATE_PACK_ID} não encontrado.`);

  const canonicalDocuments = await pack.getDocuments();
  const byName = new Map(canonicalDocuments.map((document) => [document.name, document]));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const name of CANONICAL_TEMPLATE_NAMES) {
    const canonical = byName.get(name);
    if (!canonical) throw new Error(`Template canônico ausente no Compendium: ${name}.`);
    const worldTemplate = (game.actors?.contents ?? []).find((actor) => actor.type === "_template" && actor.name === name);
    if (!worldTemplate) {
      const source = canonical.toObject();
      delete source._id;
      delete source._key;
      source.folder = null;
      source.flags = {
        ...(source.flags ?? {}),
        [MODULE_ID]: { ...(source.flags?.[MODULE_ID] ?? {}), templateSyncVersion: version },
      };
      await Actor.create(source, { renderSheet: false });
      created += 1;
      continue;
    }
    if (templateVersion(worldTemplate) === version) {
      skipped += 1;
      continue;
    }
    await worldTemplate.update(buildWorldTemplatePatch(canonical, version), {
      diff: false,
      recursive: false,
      render: false,
      naCsbAutomation: true,
    });
    updated += 1;
  }

  return { created, updated, skipped };
}
