# Fontes dos Compêndios

Esta pasta contém fontes editáveis usadas pelos scripts de build. Ela é versionada no Git, mas não entra no `module.zip`.

## Estrutura

```text
src/
├── imports/
│   └── csb-import-slayer-template.json
└── templates/
    ├── actors/
    │   ├── oni-template.json
    │   └── slayer-template.json
    └── items/
        ├── breathing-form-template.json
        └── slayer-weapon-template.json
```

Os arquivos compilados consumidos pelo Foundry são gerados em `packs/` durante o release.
