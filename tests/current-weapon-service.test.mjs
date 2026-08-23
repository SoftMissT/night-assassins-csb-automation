import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  setCurrentWeaponForActor,
  clearCurrentWeaponForActor,
  getCurrentWeaponForActor,
  validateCurrentWeaponForActor,
  resolveAttackWeaponForActor,
} from "../scripts/weapon-service.mjs";

const MODULE_ID = "night-assassins-csb-automation";

let mockFromUuidResults = {};

function mockFromUuid(uuid) {
  return mockFromUuidResults[uuid] ?? null;
}

globalThis.fromUuid = mockFromUuid;

describe("current-weapon-service", () => {
  function createMockActor(items = [], flags = {}) {
    const actorFlags = { [MODULE_ID]: { ...flags } };
    return {
      id: "actor-test-001",
      uuid: "Actor.actor-test-001",
      name: "Slayer Teste",
      items: items.map((item, idx) => ({
        id: item.id ?? `item-${idx}`,
        uuid: item.uuid ?? `Actor.actor-test-001.Item.item-${idx}`,
        name: item.name ?? `Item ${idx}`,
        type: "equipment",
        system: {
          template: "NAWeaponTpl00001",
          props: {
            arma_nome: item.name ?? `Arma ${idx}`,
            arma_critico: item.critical ?? 19,
            ...(item.props ?? {}),
          },
        },
      })),
      flags: actorFlags,
      system: {
        props: {
          nvl_num: 5,
          for_display: "10",
          dex_display: "8",
        },
      },
      async update(patch) {
        for (const [key, value] of Object.entries(patch)) {
          const parts = key.split(".");
          let target = this;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (target[part] === undefined || target[part] === null) target[part] = {};
            target = target[part];
          }
          target[parts[parts.length - 1]] = value;
        }
        return this;
      },
    };
  }

  beforeEach(() => {
    mockFromUuidResults = {};
  });

  describe("setCurrentWeaponForActor", () => {
    it("salva a arma atual no actor flags", async () => {
      const actor = createMockActor([{ id: "katana", name: "Katana" }]);
      const weaponItem = actor.items[0];

      await setCurrentWeaponForActor(actor, {
        weaponUuid: weaponItem.uuid,
        slot: "main",
        profileIndex: 0,
      });

      assert.equal(actor.flags[MODULE_ID].currentWeaponUuid, weaponItem.uuid);
      assert.equal(actor.flags[MODULE_ID].currentWeaponProfileIndex, 0);
    });

    it("salva offhand no slot correto", async () => {
      const actor = createMockActor([{ id: "wakizashi", name: "Wakizashi" }]);
      const weaponItem = actor.items[0];

      await setCurrentWeaponForActor(actor, {
        weaponUuid: weaponItem.uuid,
        slot: "offhand",
        profileIndex: 0,
      });

      assert.equal(actor.flags[MODULE_ID].offhandWeaponUuid, weaponItem.uuid);
      assert.equal(actor.flags[MODULE_ID].offhandWeaponProfileIndex, 0);
    });
  });

  describe("clearCurrentWeaponForActor", () => {
    it("limpa a arma atual do actor flags", async () => {
      const actor = createMockActor([], {
        currentWeaponUuid: "Actor.actor-test-001.Item.katana",
        currentWeaponProfileIndex: 0,
      });

      await clearCurrentWeaponForActor(actor, { slot: "main" });

      assert.equal(actor.flags[MODULE_ID].currentWeaponUuid, null);
      assert.equal(actor.flags[MODULE_ID].currentWeaponProfileIndex, null);
    });

    it("limpa a offhand separadamente", async () => {
      const actor = createMockActor([], {
        currentWeaponUuid: "Actor.actor-test-001.Item.katana",
        offhandWeaponUuid: "Actor.actor-test-001.Item.wakizashi",
        offhandWeaponProfileIndex: 0,
      });

      await clearCurrentWeaponForActor(actor, { slot: "offhand" });

      assert.equal(actor.flags[MODULE_ID].currentWeaponUuid, "Actor.actor-test-001.Item.katana");
      assert.equal(actor.flags[MODULE_ID].offhandWeaponUuid, null);
    });
  });

  describe("getCurrentWeaponForActor", () => {
    it("retorna weaponUuid null quando nao ha arma salva", () => {
      const actor = createMockActor([]);
      const result = getCurrentWeaponForActor(actor);
      assert.equal(result.weaponUuid, null);
      assert.equal(result.profileIndex, 0);
    });

    it("retorna arma principal quando salva", () => {
      const actor = createMockActor([{ id: "katana", name: "Katana" }], {
        currentWeaponUuid: "Actor.actor-test-001.Item.katana",
        currentWeaponProfileIndex: 0,
      });

      const result = getCurrentWeaponForActor(actor);
      assert.equal(result.weaponUuid, "Actor.actor-test-001.Item.katana");
      assert.equal(result.profileIndex, 0);
    });
  });

  describe("validateCurrentWeaponForActor", () => {
    it("retorna valido quando arma existe", async () => {
      const weaponItem = {
        id: "katana",
        uuid: "Actor.actor-test-001.Item.katana",
        parent: { uuid: "Actor.actor-test-001" },
        system: {
          template: "NAWeaponTpl00001",
          props: { arma_nome: "Katana", arma_critico: 19 },
        },
      };
      mockFromUuidResults["Actor.actor-test-001.Item.katana"] = weaponItem;

      const actor = createMockActor([{ id: "katana", name: "Katana" }], {
        currentWeaponUuid: "Actor.actor-test-001.Item.katana",
        currentWeaponProfileIndex: 0,
      });

      const result = await validateCurrentWeaponForActor(actor, "main");
      assert.equal(result.valid, true);
      assert.equal(result.weapon.id, "katana");
    });

    it("retorna invalido quando arma nao existe (deleted)", async () => {
      mockFromUuidResults["Actor.actor-test-001.Item.missing"] = null;

      const actor = createMockActor([], {
        currentWeaponUuid: "Actor.actor-test-001.Item.missing",
        currentWeaponProfileIndex: 0,
      });

      const result = await validateCurrentWeaponForActor(actor, "main");
      assert.equal(result.valid, false);
      assert.equal(result.reason, "Weapon item not found (deleted?)");
    });

    it("retorna invalido quando item nao e arma", async () => {
      const shieldItem = {
        id: "shield",
        uuid: "Actor.actor-test-001.Item.shield",
        parent: { uuid: "Actor.actor-test-001" },
        system: {
          template: "some-other-template",
          props: { nome: "Escudo" },
        },
      };
      mockFromUuidResults["Actor.actor-test-001.Item.shield"] = shieldItem;

      const actor = createMockActor([{ id: "shield", name: "Escudo" }], {
        currentWeaponUuid: "Actor.actor-test-001.Item.shield",
        currentWeaponProfileIndex: 0,
      });

      const result = await validateCurrentWeaponForActor(actor, "main");
      assert.equal(result.valid, false);
      assert.equal(result.reason, "Item is not a weapon");
    });
  });

  describe("resolveAttackWeaponForActor", () => {
    it("resolve arma via UUID quando fornecido", async () => {
      const weaponItem = {
        id: "katana",
        uuid: "Actor.actor-test-001.Item.katana",
        parent: { uuid: "Actor.actor-test-001" },
        system: {
          template: "NAWeaponTpl00001",
          props: { arma_nome: "Katana", arma_critico: 19 },
        },
      };
      mockFromUuidResults["Actor.actor-test-001.Item.katana"] = weaponItem;

      const actor = createMockActor([{ id: "katana", name: "Katana" }]);

      const result = await resolveAttackWeaponForActor(actor, {
        weaponUuid: "Actor.actor-test-001.Item.katana",
        slot: "main",
        profileIndex: 0,
        allowDialog: false,
        persistSelection: false,
      });

      assert.equal(result.weapon.id, "katana");
      assert.equal(result.fromDialog, false);
    });

    it("resolve arma salva quando nao ha UUID explicito", async () => {
      const weaponItem = {
        id: "katana",
        uuid: "Actor.actor-test-001.Item.katana",
        parent: { uuid: "Actor.actor-test-001" },
        system: {
          template: "NAWeaponTpl00001",
          props: { arma_nome: "Katana", arma_critico: 19 },
        },
      };
      mockFromUuidResults["Actor.actor-test-001.Item.katana"] = weaponItem;

      const actor = createMockActor([{ id: "katana", name: "Katana" }], {
        currentWeaponUuid: "Actor.actor-test-001.Item.katana",
        currentWeaponProfileIndex: 0,
      });

      const result = await resolveAttackWeaponForActor(actor, {
        slot: "main",
        allowDialog: false,
        persistSelection: false,
      });

      assert.equal(result.weapon.id, "katana");
      assert.equal(result.fromDialog, false);
    });

    it("retorna fromDialog=true quando nao ha arma salva e allowDialog=true", async () => {
      const actor = createMockActor([{ id: "katana", name: "Katana" }]);

      const result = await resolveAttackWeaponForActor(actor, {
        slot: "main",
        allowDialog: true,
        persistSelection: false,
      });

      assert.equal(result.fromDialog, true);
      assert.equal(result.weapon, null);
    });

    it("retorna weapon null quando nao ha arma e allowDialog=false", async () => {
      const actor = createMockActor([]);

      const result = await resolveAttackWeaponForActor(actor, {
        slot: "main",
        allowDialog: false,
        persistSelection: false,
      });

      assert.equal(result.weapon, null);
      assert.equal(result.fromDialog, false);
    });
  });
});
