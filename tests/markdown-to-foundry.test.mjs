import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToFoundryHtml } from "../tools/compendium-catalog-utils.mjs";

describe("markdownToFoundryHtml", () => {
  it("converte regras Markdown em HTML enriquecível pelo Foundry", () => {
    const html = markdownToFoundryHtml(`# Regra\n\n**Forte** e *ênfase*.\n\n- Um\n- Dois\n\n> Nota\n\n| Nível | Dano |\n| --- | --- |\n| 1 | 2d6 |\n\n[[Respiração das Chamas]]`);
    assert.match(html, /<h1>Regra<\/h1>/);
    assert.match(html, /<strong>Forte<\/strong>/);
    assert.match(html, /<em>ênfase<\/em>/);
    assert.match(html, /<ul><li>Um<\/li><li>Dois<\/li><\/ul>/);
    assert.match(html, /<blockquote><p>Nota<\/p><\/blockquote>/);
    assert.match(html, /<table>.*<th>Nível<\/th>.*<td>2d6<\/td>.*<\/table>/s);
    assert.match(html, /<span class="na-wikilink">Respiração das Chamas<\/span>/);
  });

  it("escapa HTML arbitrário da fonte", () => {
    assert.equal(markdownToFoundryHtml("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});
