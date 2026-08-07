import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const macroSource = fs.readFileSync(path.join(repoRoot, "macros", "na-gerenciar-status.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test("macro de Status recebe o Actor da ficha e não devolve objeto ao CSB", async () => {
  let received;
  const game = { modules: new Map([["night-assassins-csb-automation", { api: {
    openStatusManager: async (options) => { received = options; return { active: ["confuso"] }; },
  } }]]) };
  const ui = { notifications: { error: assert.fail } };
  const execute = new AsyncFunction("game", "ui", "scope", macroSource);

  const result = await execute(game, ui, { actorUuid: "Actor.Slayer" });

  assert.deepEqual(received, { actorUuid: "Actor.Slayer" });
  assert.equal(result, "");
});
