# gst 👻

CLI em Node que encontra **restos de apps desinstalados no macOS** — os
"fantasmas" (_ghosts_) que a App Store e os `.dmg` deixam para trás em
`~/Library` e nos jobs de login do `launchd`, ocupando espaço e às vezes ainda
rodando no boot.

Ele lê o bundle id de cada app **realmente instalado** (o `CFBundleIdentifier`
do `Info.plist` de `/Applications/*.app`) e cruza com as pastas do `~/Library`,
reportando o que sobrou — ordenado por tamanho e com a data da última
modificação, para você decidir com segurança.

```
  👻 gst  ·  varredura do ~/Library
  285 pastas fantasma  ·  108.1 MB para recuperar

  Restos de apps que não estão mais instalados
  44.5 MB ██████████  com.operasoftware.operaair      Caches    há 12 meses
  14.9 MB █████▊      com.openai.chat                 Caches       há 1 mês
   4.8 MB ███▎        com.steipete.codexbar           Caches     há 4 meses
```

## Requisitos

- **macOS** (usa `plutil`, `du`, `launchctl` e o Finder)
- **Node.js >= 18**

## Instalação

```bash
git clone https://github.com/bellinivitor/gst.git
cd gst
npm link      # deixa o comando `gst` disponível globalmente
```

Para desinstalar depois: `npm unlink -g gst`.

## Comandos

### `gst scan` — o que sobrou, por tamanho

```bash
gst scan            # fantasmas confiáveis (bundle id de app não instalado)
gst scan --all      # inclui palpites por nome (cuidado: caches de dev ativos)
gst scan --limit 60 # mais linhas por grupo (padrão: 40)
gst scan --json     # saída em JSON, para scripts
gst scan --system   # inclui bundle ids do sistema (com.apple.*)
```

Cada linha mostra tamanho, uma barra de proporção, o bundle id, a categoria e a
**última modificação**. Um `⚠` âmbar marca pastas tocadas nos últimos 14 dias —
sinal de que o app talvez ainda esteja em uso; confira antes de remover.

Pastas varridas: `Containers`, `Application Support`, `Caches`, `Preferences`,
`Saved Application State`, `WebKit`, `HTTPStorages` e `Logs`.

### `gst clean` — remover, sem digitar nomes

```bash
gst clean           # abre um seletor interativo
gst clean --all     # inclui também os palpites de confiança baixa
```

No seletor: **↑/↓** move · **espaço** marca · **a** marca todos · **enter**
confirma · **q** sai. Os itens são agrupados por app (remover um apaga todas as
pastas dele de uma vez). Antes de qualquer remoção há uma confirmação, e tudo é
**movido para a Lixeira** (reversível pelo "Colocar de volta").

### `gst agents` — jobs de login mortos

```bash
gst agents          # lista jobs do launchd cujo binário não existe mais
gst agents --clean  # remove os do usuário (com confirmação); os do sistema
                    # exigem sudo, então ele apenas imprime os comandos
```

Detecta itens em `~/Library/LaunchAgents`, `/Library/LaunchAgents` e
`/Library/LaunchDaemons` que apontam para um executável que já foi apagado —
tipicamente updaters de apps removidos que continuam tentando rodar no boot.

### `gst trash` — esvaziar a Lixeira

```bash
gst trash           # mostra o tamanho e pede confirmação (digite "esvaziar")
gst trash --yes     # esvazia sem perguntar (para scripts)
```

Esvaziar a Lixeira é **irreversível**.

## Confiança alta vs. baixa

- **Alta** — a pasta tem nome de bundle id (`com.exemplo.app`) e nenhum app
  instalado corresponde. Cruzamento confiável.
- **Baixa** — a pasta tem nome de app (ex.: `JetBrains`, `Homebrew`). Heurística
  ruidosa: muita coisa aí é cache de ferramenta de dev **ainda em uso**. Só
  aparece com `--all`. Sempre confira antes de apagar.

Bundle ids do sistema (`com.apple.*`) e extensões de apps instalados
(ex.: `com.microsoft.teams2.widgetextension` quando o Teams está instalado)
ficam de fora por padrão.

## ⚠️ Isenção de responsabilidade

**Este software é fornecido "COMO ESTÁ", sem garantia de qualquer tipo.** Ele
apaga arquivos e remove jobs do sistema — use por sua conta e risco.

O autor **não se responsabiliza** por qualquer perda de dados, mau
funcionamento, ou dano direto ou indireto decorrente do uso desta ferramenta. As
heurísticas de detecção **podem gerar falsos positivos** (identificar como órfão
algo que ainda está em uso). **Você é o único responsável** por revisar o que
será removido antes de confirmar.

Recomendações:

- Rode `gst scan` e **leia a lista** antes de qualquer `clean`.
- Comece pela remoção para a **Lixeira** (padrão) e só esvazie depois de
  confirmar que nada quebrou.
- Tenha um **backup** atualizado (Time Machine ou equivalente).

Ao usar `gst`, você concorda com estes termos.

## Licença

[MIT](LICENSE) — sem garantias. Veja a isenção acima.
