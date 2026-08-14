const LEVEL = (cost, options = {}) => ({ cost, ...options });

export const FLAME_FORMS = Object.freeze([
  { id: "chamas_01", style: 3, name: "Esquentar", passive: true, action: null, weaponHeat: 0, enemyHeat: 0, levels: [LEVEL(0), LEVEL(0), LEVEL(0), LEVEL(0)] },
  { id: "chamas_02", style: 1, name: "Fogo Desconhecido / Tempestade Ígnea", action: "especial", weaponHeat: 2, enemyHeat: 0, levels: [
    LEVEL(2, { damage: "2d4", extraAttacks: 0 }), LEVEL(3, { damage: "2d4", extraAttacks: 1 }),
    LEVEL(3, { damage: "2d4", extraAttacks: 1, extraAttackDamage: "1d4" }), LEVEL(4, { damage: "2d4", extraAttacks: 1, extraAttackDamage: "2d4" }),
  ] },
  { id: "chamas_03", style: 2, name: "Céu em Chamas Ascendentes", action: "ataque", weaponHeat: 3, enemyHeat: 2, levels: [
    LEVEL(3, { criticalOnHit: true }), LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2 }),
    LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2, hitBonus: 1 }), LEVEL(3, { criticalOnHit: true, blockPenalty: -2, blockPenaltyTurns: 2, hitBonus: 2 }),
  ] },
  { id: "chamas_04", style: 4, name: "Ondulação da Chama Fluorescente", action: "reacao", weaponHeat: 2, enemyHeat: 0, levels: [
    LEVEL(1, { blockBonus: 1 }), LEVEL(1, { blockBonus: 2 }), LEVEL(2, { blockBonus: 3 }), LEVEL(3, { blockBonus: 4 }),
  ] },
  { id: "chamas_05", style: 5, name: "Tigre Ardente", action: "ataque", weaponHeat: 3, enemyHeat: 3, levels: [
    LEVEL(3, { damage: "4d10", hitCount: 1 }), LEVEL(3, { damage: "5d10", hitCount: 1 }),
    LEVEL(4, { damage: "6d10", hitCount: 1 }), LEVEL(5, { damage: "6d10", hitCount: 1, exhaustionOverDamage: 30 }),
  ] },
  { id: "chamas_06", style: 6, name: "Tormenta de Chamas", action: "ataque", weaponHeat: 4, enemyHeat: 4, levels: [
    null, null, LEVEL(6, { damage: "8d8", areaMeters: 10, evasionDc: 16, halfOnSave: true }),
    LEVEL(8, { damage: "8d8", damagePerEnemyHeat: "1d8", areaMeters: 10, evasionDc: 16, halfOnSave: true }),
  ] },
  { id: "chamas_07", style: 7, name: "Cauterizar", action: "especial", weaponHeat: 0, enemyHeat: 0, minimumWeaponHeat: 5, levels: [
    LEVEL(2, { healing: "1d6" }), LEVEL(3, { healing: "2d6" }), LEVEL(3, { healing: "3d6", removeBleeding: true }), LEVEL(4, { healing: "4d6", removeBleeding: true }),
  ] },
  { id: "chamas_08", style: 8, name: "Ignição", action: "especial", weaponHeat: 0, enemyHeat: 0, levels: [
    null, null, LEVEL(5, { selfDamage: 5, damageBonus: 5, turns: 3 }), LEVEL(5, { selfDamage: 5, damageBonus: 8, turns: 3 }),
  ] },
  { id: "chamas_09", style: 9, name: "Rengoku", action: "ataque", weaponHeat: 4, enemyHeat: 4, levels: [
    null, LEVEL(4, { hitBonus: 4, saveBaseDc: 10, vulnerableOnFail: true }),
    LEVEL(4, { hitBonus: 4, saveBaseDc: 12, vulnerableOnFail: true }), LEVEL(5, { hitBonus: 4, saveBaseDc: 12, vulnerableOnFail: true, exhaustionOnHit: 1 }),
  ] },
]);

export function flameFormById(id) {
  return FLAME_FORMS.find((form) => form.id === String(id ?? "")) ?? null;
}

export function flameWeaponTier(rawHeat) {
  const heat = Math.max(0, Math.min(60, Math.trunc(Number(rawHeat) || 0)));
  if (heat >= 60) return { heat, hit: 3, weaponDamage: 3, techniqueDie: "1d6", multiplier: 1.5, selfDamage: 2 };
  if (heat >= 50) return { heat, hit: 3, weaponDamage: 3, techniqueDie: "1d6", multiplier: 1, selfDamage: 0 };
  if (heat >= 40) return { heat, hit: 2, weaponDamage: 3, techniqueDie: "1d6", multiplier: 1, selfDamage: 0 };
  if (heat >= 30) return { heat, hit: 2, weaponDamage: 2, techniqueDie: "1d6", multiplier: 1, selfDamage: 0 };
  if (heat >= 20) return { heat, hit: 2, weaponDamage: 2, techniqueDie: "", multiplier: 1, selfDamage: 0 };
  if (heat >= 10) return { heat, hit: 1, weaponDamage: 2, techniqueDie: "", multiplier: 1, selfDamage: 0 };
  if (heat >= 5) return { heat, hit: 1, weaponDamage: 1, techniqueDie: "", multiplier: 1, selfDamage: 0 };
  return { heat, hit: 0, weaponDamage: 0, techniqueDie: "", multiplier: 1, selfDamage: 0 };
}
