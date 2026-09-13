# gst 👻

CLI em Node que encontra **pastas órfãs no macOS** deixadas por apps desinstalados
— os "fantasmas" que a App Store e os `.dmg` deixam para trás em `~/Library`.

Ele lista os bundle ids dos apps realmente instalados (lendo o `Info.plist` de
cada `/Applications/*.app`) e cruza com as subpastas do `~/Library`, reportando
o que sobrou, ordenado por tamanho.

## Instalação

```bash
git clone git@github.com:bellinivitor/gst.git
cd gst
npm link      # deixa o comando `gst` global
```

Requer Node >= 18 e macOS (usa `plutil` e `du`).

## Uso

```bash
gst scan            # fantasmas confiáveis (bundle id de app não instalado)
gst scan --all      # inclui palpites por nome (cuidado: caches de dev ativos)
gst scan --limit 60 # mais linhas por grupo
gst scan --json     # saída para scripts
gst --help
```

### O que ele varre

`~/Library/Containers`, `Application Support`, `Caches`, `Preferences`,
`Saved Application State`, `WebKit`, `HTTPStorages` e `Logs`.

### Confiança alta vs. baixa

- **Alta** — a pasta tem nome de bundle id (`com.exemplo.app`) e nenhum app
  instalado corresponde. Cruzamento confiável.
- **Baixa** — a pasta tem nome de app (ex.: `JetBrains`, `Homebrew`). Heurística
  ruidosa: muita coisa aí é cache de ferramenta de dev **ainda em uso**. Sempre
  confira antes de apagar.

Bundle ids do sistema (`com.apple.*`) e extensões de apps instalados
(ex.: `com.microsoft.teams2.widgetextension` quando o Teams está instalado)
ficam de fora por padrão.

## Status

- [x] `scan` — varredura e relatório por tamanho
- [ ] `clean` — remoção interativa (dry-run por padrão, movendo para a Lixeira)

## Licença

MIT
