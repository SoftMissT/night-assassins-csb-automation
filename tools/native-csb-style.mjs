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
  const searchable = [node.key, node.value, node.label, node.title]
    .filter((value) => typeof value === "string")
    .join(" ");
  if (/(?:^|\W|_)pdv(?:$|\W|_)/i.test(searchable)) return "na-resource-pdv";
  if (/(?:^|\W|_)pdr(?:$|\W|_)/i.test(searchable)) return "na-resource-pdr";
  if (/(?:^|\W|_)pdk(?:$|\W|_)/i.test(searchable)) return "na-resource-pdk";
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
  const color = ATTRIBUTE_LABELS[name];
  if (!color) return "";
  return `<div class="custom-orbitron-wrapper"><style>@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');</style><span style="font-family: 'Orbitron', 'Times New Roman', serif; font-size: 16px; font-weight: 700; color:${color}; text-transform: uppercase; letter-spacing: .12em;">${name}</span></div>`;
}

export function useNativeCsbPresentation(document) {
  let convertedLabels = 0;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    const cssClass = resourceCssClass(node);
    if (cssClass) appendCssClass(node, cssClass);
    if (node.type === "label"
      && node.style === "button"
      && typeof node.rollMessage === "string"
      && node.rollMessage
      && typeof node.value === "string") {
      const plain = labelHtmlToPlainText(node.value).toUpperCase();
      const decorated = orbitronAttributeLabel(plain);
      const attrMatch = node.rollMessage.match(/attr\s*:\s*['"](VIT|DEX|FOR|CAR|FDV|INT|SAB)['"]/i);
      if (decorated && attrMatch?.[1]?.toUpperCase() === plain && node.value !== decorated) {
        node.value = decorated;
        convertedLabels += 1;
      }
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(document);
  return convertedLabels;
}
