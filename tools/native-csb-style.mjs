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

export function useNativeCsbPresentation(document) {
  let convertedLabels = 0;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    const cssClass = resourceCssClass(node);
    if (cssClass) appendCssClass(node, cssClass);
    if (node.type === "label" && typeof node.value === "string" && /<[a-z!/]/i.test(node.value)) {
      const plain = labelHtmlToPlainText(node.value);
      if (plain) {
        node.value = plain;
        convertedLabels += 1;
      }
    }
    if (typeof node.title === "string" && /<[a-z!/]/i.test(node.title)) {
      const plain = labelHtmlToPlainText(node.title);
      if (plain) node.title = plain;
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(document);
  return convertedLabels;
}
