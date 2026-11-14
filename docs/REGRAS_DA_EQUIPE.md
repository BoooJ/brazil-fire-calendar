# Regras da equipe — Brazil Fire Calendar

*NASA Space Apps Challenge 2026 · "Harmonization of MODIS and VIIRS Hot Spots"* · [English version](TEAM_RULES.md)

## 1. Nosso objetivo

Construir um site que transforma mais de 20 anos de focos de calor da NASA no Brasil em um **calendário de queimadas** consistente, para que a troca de satélites não crie mais saltos falsos.

**Enviar até domingo, 15/11, às 21h. Prazo final: 23h** (nosso horário local).

## 2. Escopo: o MVP vem primeiro

1. As **17 funcionalidades do MVP** no [README](../README.md#mvp-features) são o trabalho. Nada além disso até todas funcionarem.
2. **Extras** só depois que o checkpoint de domingo às 12h for cumprido.
3. **Congelamento de funcionalidades: domingo às 15h.** Depois disso: só correções, acabamento, vídeo e envio.
4. **Não vamos fazer:** previsões, dados que não sejam da NASA, outros países (exceto como extra no final).
5. Se duas regras entrarem em conflito, **o prazo vence**: entreguem o MVP.

## 3. Regras de dados

1. **Somente dados do NASA FIRMS.**
2. **Nunca façam commit de arquivos de dados** (CSV, zip, Parquet). Os scripts em `infra/` recriam esses arquivos.
3. Guardem os dados **fora do OneDrive / Dropbox / Google Drive** (definam `DATA_DIR` no `.env`).
4. **Nunca façam commit de segredos** (`.env`, chaves de API, senhas). Compartilhem em particular no chat da equipe.
5. Nunca mostrem um número que não sabemos explicar. Dados recentes são marcados como **provisórios**, dados fracos como **incertos**, e o cartão dos "próximos meses" sempre diz **"não é uma previsão"**.

## 4. Quem cuida do quê

Cada pasta tem um responsável. **Não editem a pasta de outra pessoa sem perguntar.** Qualquer um pode ajudar em outra pasta se o responsável concordar.

| Pasta | Responsável | Conteúdo |
|---|---|---|
| `infra/` | Infraestrutura | Download, limpeza, código da harmonização, API, atualização diária, hospedagem da API |
| `web/` | UI/UX | O site: mapa, calendário, gráficos, downloads, acessibilidade, hospedagem do site |
| `science/` | Cientista | Método de harmonização, validação, textos do painel de confiabilidade |
| `docs/api-contract.md` + `web/mocks/` | Infraestrutura + UI/UX juntos | O acordo entre a API e o site |

Quem decide:

- **Números e cálculos:** infraestrutura + cientista.
- **Cores, layout, textos na tela:** UI/UX.
- **O método:** cientista.
- **O contrato da API:** os dois lados, depois fica congelado.

## 5. Fluxo no GitHub

Comandos passo a passo (em inglês): [GIT_GUIDE.md](GIT_GUIDE.md).

1. **A `main` sempre funciona.** Nunca enviem código quebrado para a `main`.
2. **Uma branch por tarefa:** `infra/...`, `web/...`, `science/...` (ex.: `web/calendar`).
3. Façam `git pull` na `main` antes de começar uma nova tarefa.
4. **Pull requests pequenos, com merge várias vezes por dia**, e não um merge gigante no domingo.
5. Preencham o checklist do pull request: funciona, sem dados, sem segredos, contrato atualizado se a API mudou.
6. Alguém dá uma olhada de 2 minutos. Ninguém disponível em 15 minutos? Façam o merge vocês mesmos, se estiver funcionando.
7. **Uma Issue no GitHub por funcionalidade.** Atribuam a si mesmos e fechem quando terminar.
8. Mensagens de commit claras: "Add calendar hover tooltip", e não "fix".
9. **Agentes de IA** (Claude Code) leem o `CLAUDE.md` (na raiz e em cada pasta). Atualizem o arquivo em um pull request quando algum fato mudar. Toda mudança em um `CLAUDE.md` passa por uma olhada humana rápida.

## 6. O contrato da API

1. O [`docs/api-contract.md`](api-contract.md) fica **congelado depois do kickoff**.
2. O site é construído com os arquivos falsos de `web/mocks/` até a API real ficar pronta.
3. Uma mudança = mensagem no chat + atualizar o contrato **e** os mocks no mesmo pull request.

## 7. Comunicação

1. **Um único canal:** o chat da equipe.
2. **Travado há mais de 30 minutos? Avise.** Pedir ajuda cedo não é fraqueza.
3. Em cada checkpoint, todos postam 3 linhas: **feito / fazendo / travado**.
4. Uma decisão escrita no chat é final, a menos que algo esteja quebrado.

## 8. Cronograma

| Quando | Meta |
|---|---|
| **Sábado, kickoff (2 h)** | Plano aprovado · contas da NASA (Earthdata, FIRMS MAP_KEY) · pedidos de dados enviados · downloads iniciados · contrato congelado |
| **Sábado 21h** | **Checkpoint 1:** primeiro calendário bruto do Pantanal com **dados reais** no site |
| **Sábado à noite** | Dormir |
| **Domingo 12h** | **Checkpoint 2:** as 17 funcionalidades do MVP funcionando (mesmo que de forma simples), no ar |
| **Domingo 15h** | **Congelamento de funcionalidades** |
| **Domingo 19h** | Vídeo / slides prontos |
| **Domingo 21h** | **Projeto enviado** |
| **Domingo 23h** | Prazo final |

## 9. "Pronto" significa

1. Funciona com **dados reais** (não só com os mocks).
2. Merge feito na `main`.
3. Funciona em uma tela do **tamanho de celular**.
4. Sem erros no console do navegador.
5. Cores legíveis para daltônicos (verificado, não suposto).

## 10. Envio

1. Repositório **público** (ou com acesso para os jurados) antes do envio.
2. O README lista os **dados da NASA usados** e como rodar o projeto.
3. Informar as **ferramentas de IA** que usamos, se o formulário pedir.
4. Verificação final: **nenhum segredo** no código nem no histórico.

## 11. Cuidem-se

Durmam no sábado à noite, comam, bebam água. Uma equipe descansada entrega; uma equipe exausta quebra a `main` às 18h.
