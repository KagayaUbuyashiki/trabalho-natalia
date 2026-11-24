[![Deploy](https://github.com/KagayaUbuyashiki/trabalho-natalia/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/KagayaUbuyashiki/trabalho-natalia/actions/workflows/deploy.yml)
[![CI](https://github.com/KagayaUbuyashiki/trabalho-natalia/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/KagayaUbuyashiki/trabalho-natalia/actions/workflows/ci.yml)

# Portfólio Profissional · Esteira de Produção (CI/CD)

Portfólio de **Matheus Sá De Araujo Miranda**, publicado automaticamente no GitHub Pages por uma pipeline do GitHub Actions que protege a branch `main`.

🔗 **Site no ar:** https://kagayaubuyashiki.github.io/trabalho-natalia/

## Estrutura do projeto

```
.
├── index.html                  # página do portfólio (obrigatório na raiz)
├── style.css                   # folha de estilos
├── images/                     # imagens do site (todas abaixo de 500KB)
│   ├── avatar.svg
│   ├── favicon.svg
│   ├── whatsapp.svg
│   └── projetos/
├── scripts/
│   └── verificar-links.mjs     # valida todos os links e imagens do HTML
├── .github/workflows/
│   ├── ci.yml                  # Integração Contínua (Pull Requests para a main)
│   └── deploy.yml              # Entrega Contínua (GitHub Pages)
├── .htmlhintrc                 # regras do linter de HTML
└── package.json                # dependências (HTMLHint) e scripts
```

## Etapa 1 · CI: proteção da branch `main`

Arquivo: [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Dispara **apenas** em `pull_request` para a `main`.

| Job | O que faz |
|---|---|
| `Verificar index.html` | Primeira etapa da pipeline. Se o `index.html` não existir na raiz (por exemplo, renomeado para `home.html`), falha imediatamente e nenhum outro job roda. |
| `Linter HTML (Node 18)` / `Linter HTML (Node 20)` | Prepara o runner, baixa o código, instala as dependências (`npm ci`) e executa o HTMLHint. Roda em paralelo nas duas versões via `strategy: matrix`. |
| `Validações de produção` | Bloqueia arquivos maiores que 500KB (`find -size +500k`); faz varredura de `TODO`, `FIXME`, termos sensíveis e comentários esquecidos; verifica todas as tags de link e imagem (`a`, `link`, `img`, `script`, `source`), garantindo que caminhos locais existam, âncoras apontem para ids reais e URLs externas respondam. |
| `ci-aprovado` | Consolida o resultado. Só fica verde se **todos** os jobs passarem. É o status exigido na regra de proteção da `main`. |

Se qualquer critério falhar, a pipeline fica vermelha e o botão de **Merge** fica bloqueado.

## Etapa 2 · CD: publicação automática

Arquivo: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Dispara a cada `push` na `main` (ou seja, quando um PR aprovado é unido).

- Tem as `permissions` `pages: write` e `id-token: write`, que autorizam o GitHub a publicar no Pages.
- Publica apenas os arquivos do site (`index.html`, `style.css` e `images/`) usando `actions/upload-pages-artifact` e `actions/deploy-pages`.

## Etapa 3 · Badge de status

Os badges no topo deste README mostram em tempo real se as pipelines estão `passing` ou `failing`.

## Etapa 4 · Notificações

O job `notificar` do deploy envia uma mensagem para um canal do Discord: ❌ quando o deploy falha, com o link do run, e ✅ quando conclui.

Para ativar: **Settings → Secrets and variables → Actions → New repository secret**, com o nome `DISCORD_WEBHOOK_URL` e a URL do webhook do canal.

Além disso, o GitHub envia e-mail automático para quem disparou o workflow sempre que um run falha.

## Etapa 5 · Matrix Strategy

O job de linter usa:

```yaml
strategy:
  matrix:
    node-version: [18, 20]
```

Assim ele roda simultaneamente no Node.js 18 e no Node.js 20.

## Rodando localmente

```bash
npm ci
npm run lint
npm run links
```

## Configuração do repositório

1. **Settings → Pages → Build and deployment → Source:** `GitHub Actions`.
2. **Settings → Rules → Rulesets** (ou **Branches → Branch protection rules**) para a `main`:
   - exigir Pull Request antes do merge;
   - exigir que o status `ci-aprovado` passe (*Require status checks to pass*).
3. **Settings → Collaborators:** colaboradora `09116428-collab`.
