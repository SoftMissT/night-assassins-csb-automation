import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanOniTemplate } from "./clean-oni-template.mjs";
import { migrateSlayerTemplate, wrapSlayerTemplate } from "./migrate-slayer-template.mjs";
import { useNativeCsbPresentation } from "./native-csb-style.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actorDirectory = path.join(root, "src", "templates", "actors");

async function rewrite(file, transform) {
  const target = path.join(actorDirectory, file);
  const source = JSON.parse(await readFile(target, "utf8"));
  const repaired = transform(source);
  useNativeCsbPresentation(repaired);
  await writeFile(target, `${JSON.stringify(repaired, null, 2)}\n`, "utf8");
}

const slayerPath = path.join(actorDirectory, "slayer-template.json");
const slayerSource = JSON.parse(await readFile(slayerPath, "utf8"));
const slayer = migrateSlayerTemplate(slayerSource);
useNativeCsbPresentation(slayer);
await writeFile(slayerPath, `${JSON.stringify(slayer, null, 2)}\n`, "utf8");
await writeFile(
  path.join(root, "src", "imports", "csb-import-slayer-template.json"),
  `${JSON.stringify(wrapSlayerTemplate(slayer), null, 2)}\n`,
  "utf8",
);
await rewrite("oni-template.json", cleanOniTemplate);
await rewrite("oni-minion-template.json", (source) => source);
await rewrite("npc-template.json", (source) => source);

console.log("Templates canônicos reparados: Slayer, Oni, Oni Minion e NPC.");
