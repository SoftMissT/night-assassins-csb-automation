import originCatalog from "../../catalogs/slayer/origins.json" with { type: "json" };

function origin(key) {
  const definition = originCatalog.origins[String(key ?? "")];
  if (!definition) throw new RangeError(`Origem Slayer desconhecida: ${String(key ?? "")}`);
  return definition;
}

export function slayerOriginContract(key) {
  return structuredClone(origin(key));
}

export function originUnlocksAtLevel(key, rawLevel) {
  const level = Math.max(0, Math.trunc(Number(rawLevel)) || 0);
  return structuredClone(origin(key).abilities.filter((ability) => ability.level <= level));
}

export function allSlayerOriginKeys() {
  return Object.keys(originCatalog.origins);
}

export function validateOriginContract(key) {
  const definition = origin(key);
  const levels = definition.abilities.map(({ level }) => level);
  return {
    valid: Number.isFinite(definition.pdvBase)
      && Number.isFinite(definition.pdrBase)
      && levels.length === 2
      && levels.includes(1)
      && levels.includes(6)
      && definition.abilities.every((ability) => ability.id && ability.trigger),
    levels,
  };
}
