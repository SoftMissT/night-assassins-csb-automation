# Fontes empacotadas

Fontes do tema do módulo (`styles/na-csb-automation.css`). Substituem o `@import` do
Google Fonts: o Foundry abre sem depender de rede externa.

| Arquivo | Família | Peso | Origem | Licença |
|---|---|---|---|---|
| `Orbitron-latin.woff2` | Orbitron (variável) | 600–800 | `fonts.gstatic.com/s/orbitron/v35/` | SIL OFL 1.1 (`OFL-Orbitron.txt`) |
| `Rajdhani-400-latin.woff2` | Rajdhani | 400 | `fonts.gstatic.com/s/rajdhani/v17/` | SIL OFL 1.1 (`OFL-Rajdhani.txt`) |
| `Rajdhani-500-latin.woff2` | Rajdhani | 500 | idem | idem |
| `Rajdhani-600-latin.woff2` | Rajdhani | 600 | idem | idem |
| `Rajdhani-700-latin.woff2` | Rajdhani | 700 | idem | idem |

- Obtidas em 2026-10-13 pelo CSS da API do Google Fonts (`css2`), subconjunto `latin`
  (cobre todo o pt-BR). `latin-ext` e `devanagari` ficaram de fora de propósito.
- Textos de licença copiados de `github.com/google/fonts` (`ofl/orbitron/OFL.txt`,
  `ofl/rajdhani/OFL.txt`). A OFL exige que a licença acompanhe a redistribuição.
- Os dois nomes são "Reserved Font Name": não renomeie nem modifique os arquivos
  mantendo o nome. Para trocar de fonte, substitua o arquivo e o `@font-face`.
- Integridade: o teste `tests/font-assets.test.mjs` confere que cada `@font-face`
  aponta para um arquivo existente em formato `wOF2`.

SHA-256 (primeiros 16 hex, de 2026-10-13):

```
Orbitron-latin.woff2      C25A9F9DA5D9F3DB
Rajdhani-400-latin.woff2  759A9000E47B0287
Rajdhani-500-latin.woff2  23AFDB9B5B89B878
Rajdhani-600-latin.woff2  433A7007E4747A02
Rajdhani-700-latin.woff2  5B7E4A6F97163C26
```
