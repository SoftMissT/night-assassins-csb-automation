const HTML_ENTITY_REPLACEMENTS = Object.freeze([
  [/&nbsp;|&#160;/gi, " "],
  [/&amp;/gi, "&"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
]);

export function labelHtmlToPlainText(value) {
  let text = String(value ?? "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/?(?:div|p|section|article|li|tr|td|th|h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [pattern, replacement] of HTML_ENTITY_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

function appendCssClass(node, cssClass) {
  const classes = new Set(String(node.cssClass ?? "").split(/\s+/).filter(Boolean));
  classes.add(cssClass);
  node.cssClass = [...classes].join(" ");
}

function resourceCssClass(node) {
  const searchable = [node.key, node.name, node.value, node.label, node.title]
    .filter((value) => typeof value === "string")
    .join(" ");
  if (/(?:^|\W|_)pdk(?:$|\W|_)/i.test(searchable)) return "na-resource-pdk";
  if (/(?:^|\W|_)pdv(?:$|\W|_)/i.test(searchable)) return "na-resource-pdv";
  if (/(?:^|\W|_)pdr(?:$|\W|_)/i.test(searchable)) return "na-resource-pdr";
  return "";
}

export const ATTRIBUTE_LABELS = Object.freeze({
  VIT: "#36D67A",
  DEX: "#28D7FF",
  FOR: "#C1000C",
  CAR: "#FF9100",
  FDV: "#BB97F9",
  INT: "#F8EB4D",
  SAB: "#D45CA4",
});

export function orbitronAttributeLabel(attribute) {
  const name = String(attribute ?? "").trim().toUpperCase();
  return ATTRIBUTE_LABELS[name] ? name : "";
}

function attributeName(node) {
  const rollAttribute = String(node.rollMessage ?? "").match(/attr\s*:\s*['"](VIT|DEX|FOR|CAR|FDV|INT|SAB)['"]/i)?.[1];
  if (rollAttribute) return rollAttribute.toUpperCase();

  const plain = labelHtmlToPlainText(node.value ?? node.label ?? "");
  const leading = plain.match(/^\s*(VIT|DEX|FOR|CAR|FDV|INT|SAB)(?:\b|\s*:)/i)?.[1];
  return leading?.toUpperCase() ?? "";
}

export function useNativeCsbPresentation(document) {
  let convertedLabels = 0;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    const cssClass = resourceCssClass(node);
    if (cssClass) appendCssClass(node, cssClass);
    if (typeof node.title === "string" && /custom-orbitron-wrapper|na-sheet-text|<style\b|style\s*=/i.test(node.title)) {
      node.title = labelHtmlToPlainText(node.title);
      convertedLabels += 1;
    }
    if (node.type === "label" && typeof node.value === "string") {
      if (/custom-orbitron-wrapper|na-sheet-text|<style\b|style\s*=/i.test(node.value)) {
        node.value = labelHtmlToPlainText(node.value);
        convertedLabels += 1;
      }
      const attribute = attributeName(node);
      if (attribute) {
        appendCssClass(node, "na-attribute-label");
        appendCssClass(node, `na-attribute-${attribute.toLowerCase()}`);
      }
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(document);
  return convertedLabels;
}
