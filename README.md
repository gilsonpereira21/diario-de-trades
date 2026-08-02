# Diário de Trades com Psicologia

MVP de um diário de trades focado em **disciplina comportamental antes de
performance financeira**. O número central do app é o **score de disciplina**
(0-100) e o **streak de dias disciplinados** — não o P&L. Além disso, registra
o **estado emocional antes/depois de cada operação** e alerta padrões
destrutivos (ex: revenge trading após perdas seguidas).

Site estático — HTML/CSS/JS puro, sem build step (Node não é necessário para
rodar o site). Backend é o Supabase (Postgres + Auth), com uma única function
serverless (Netlify Functions) para a leitura de print via IA, que é a única
parte que precisa de uma chave secreta protegida no servidor.

## Stack

- Frontend: HTML + CSS + JavaScript (ES modules), sem framework/bundler
- Gráficos: SVG desenhado à mão (curva de patrimônio, desempenho por ativo/dia)
- Backend: [Supabase](https://supabase.com) (Postgres, Auth com e-mail/senha e
  Google, Row Level Security)
- Deploy: [Netlify](https://netlify.com), com deploy automático a partir do
  GitHub (todo `git push` no branch `main` publica sozinho)
- IA de leitura de print: [Google Gemini](https://aistudio.google.com) (camada
  gratuita), chamada a partir de uma Netlify Function

## Setup

### 1. Criar o projeto Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto.
2. No **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
   Isso cria as tabelas `trades` e `user_settings`, ambas com Row Level
   Security (cada usuário só vê os próprios dados). Se você já tinha rodado
   uma versão anterior desse arquivo, pode rodar de novo sem problema — os
   comandos são idempotentes (`if not exists`).
3. Em **Settings → API**, copie a **Project URL** e a chave **anon public**.

### 2. Configurar o app

Edite [`js/config.js`](js/config.js) e cole os dois valores:

```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "sua-chave-anon";
```

### 3. Rodar localmente

Como são módulos ES (`type="module"`), o navegador exige que os arquivos
sejam servidos via HTTP (abrir o `index.html` direto com `file://` não
funciona). Sem Node instalado, a forma mais simples no Windows é usar a
extensão **Live Server** do VS Code (botão direito em `index.html` → "Open
with Live Server"), ou o Python se estiver instalado:

```powershell
python -m http.server 5500
```

Depois acesse `http://localhost:5500/login.html`, crie uma conta e comece a
registrar trades.

### 4. Login com Google (opcional)

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto
   e configure a **tela de permissão OAuth** (External).
2. Em **APIs e serviços → Credenciais**, crie um **OAuth client ID** do tipo
   *Web application*, com:
   - Authorized JavaScript origins: a URL do seu site publicado
   - Authorized redirect URIs: `https://SEU-PROJETO.supabase.co/auth/v1/callback`
3. No Supabase, em **Authentication → Providers → Google**, ative e cole o
   Client ID e o Client Secret gerados.
4. Publique o app OAuth (**Público-alvo → Publicar app**) para liberar login
   de qualquer conta Google, não só contas de teste.

### 5. Leitura de print via IA (opcional)

1. Gere uma chave grátis em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   (API do Gemini).
2. No painel do Netlify do seu site: **Project configuration → Environment
   variables**, adicione:
   - `GEMINI_API_KEY` — a chave gerada acima (secreta, nunca vai pro código)
   - `SUPABASE_URL` — a mesma URL do `js/config.js`
   - `SUPABASE_ANON_KEY` — a mesma chave anon do `js/config.js`
3. Faça um novo deploy (qualquer `git push` já dispara) para a function
   [`netlify/functions/parse-trade-image.js`](netlify/functions/parse-trade-image.js)
   pegar as variáveis novas.

Sem essas variáveis configuradas, a opção "Analisar com IA" em
[import.html](import.html) continua acessível mas retorna erro — a
importação de CSV/HTML e o OCR local não dependem disso.

## O que já está no MVP

- Cadastro/login por e-mail e senha, e login com Google (Supabase Auth)
- Registro manual de trades: ativo, lado, quantidade, preços de entrada/saída,
  stop loss, take profit, datas, notas
- Campo de **estado emocional antes** de cada trade é **obrigatório** (o de
  depois é opcional) — confiante, ansioso, ganancioso, vingativo, medo,
  eufórico, cansado, neutro. (Trades vindos de CSV/HTML/IA/OCR continuam
  entrando sem emoção — o campo é obrigatório só no cadastro manual em tempo real.)
- **Score de disciplina (0-100) e streak** ([js/discipline.js](js/discipline.js)):
  calculado a partir de 3 regras fixas, cada uma opcional de configurar em
  **Configure suas regras de disciplina** no topo do Dashboard —
  1) respeitou o stop loss definido, 2) não excedeu um tamanho máximo de
  posição, 3) operou dentro de uma janela de horário. Uma regra sem dado
  configurado simplesmente não entra na conta (não penaliza nem favorece).
  O streak conta dias consecutivos **com trade** e score acima do limiar
  definido (padrão 80%) — um dia sem nenhuma operação não quebra o streak,
  só não soma.
- Métricas automáticas por período (hoje / 7 dias / 30 dias / tudo): win
  rate, risco/retorno médio (R), expectância, resultado total, drawdown máximo
- Detecção de padrões comportamentais:
  - queda de performance depois de 2 perdas seguidas (revenge trading)
  - queda de performance associada a um estado emocional específico
  - aumento de tamanho de posição logo após uma perda
- Gráficos: curva de patrimônio acumulado, desempenho por ativo, desempenho
  por dia da semana
- Edição e exclusão de trades
- **Importação unificada** ([import.html](import.html)): uma única tela,
  um único campo de arquivo — o app detecta sozinho o que você subiu e segue
  o caminho certo:
  - **CSV ou HTML** (extrato da corretora, relatório salvo do navegador):
    mapeia as colunas (com sugestão automática, e escolha manual de qual
    tabela usar quando o arquivo tem mais de uma — comum em relatórios do
    MT5), confirma o significado de cada valor de "lado" (compra/venda) e
    importa tudo de uma vez. Aceita separador vírgula ou ponto e vírgula,
    números em formato BR (1.234,56) ou internacional (1,234.56), datas em
    dd/mm/aaaa ou aaaa-mm-dd. Sem limite de tamanho, sem custo.
  - **Print ou PDF via IA**: o Gemini extrai **todas** as operações que
    encontrar no arquivo. Sujeito ao limite de uso grátis da API e a um
    timeout de 60s da Netlify Function para arquivos muito grandes/com
    muitas páginas — até ~4MB.
  - **Print sem IA (OCR local)**: link alternativo na mesma tela — roda
    [Tesseract.js](https://github.com/naptha/tesseract.js) inteiramente no
    navegador (grátis, sem limite de uso, sem servidor). Só imagens (não
    PDF), bem menos preciso — serve como rascunho, mostra o texto bruto
    lido pra você conferir.
  - Todos os três caminhos caem na mesma tela de revisão (checkbox por
    linha); nada é salvo sem confirmação manual.

## Fora do escopo deste MVP (próximas fatias)

- Check-in matinal (sono, humor, notícias do dia)
- Resumo automático de fechamento do dia
- Alerta de "você já operou X vezes hoje, historicamente sua performance cai"
- Tela dedicada de configuração de regras (hoje é só um formulário simples
  embutido no Dashboard, sem liga/desliga por regra)
- Alertas em tempo real ("você está prestes a repetir seu padrão")
- Planos pagos / cobrança (Free vs Pro) — hoje o app não tem nenhum limite
  ou paywall implementado
- "Modo trava" (bloqueio de horários de pior desempenho)
- Empacotamento como app mobile (PWA/Capacitor)

## Estrutura de arquivos

```
index.html          Dashboard (métricas, gráficos, alertas de padrão)
login.html           Login / criação de conta (e-mail/senha + Google)
trades.html           Registro e lista de trades
import.html            Importação unificada (CSV/HTML/print/PDF, IA ou OCR)
css/style.css              Estilos (design tokens claro/escuro)
js/config.js                Credenciais do Supabase (preencher)
js/supabaseClient.js          Cliente Supabase
js/auth.js                     Login/logout/sessão (e-mail + Google)
js/metrics.js                    Cálculo de win rate, R:R, expectância, drawdown
js/patterns.js                     Detecção de padrões comportamentais
js/charts.js                         Gráficos SVG (linha e barras)
js/emotions.js                         Lista de estados emocionais
js/discipline.js                          Score de disciplina (3 regras) + streak
js/settings.js                               Regras de disciplina do usuário (get/save)
js/csv.js                                 Parser de CSV/HTML + normalização de números/datas/lado
js/ocr.js                                    Leitura de texto local (Tesseract.js) + parser heurístico
js/nav.js                                    Menu mobile (hambúrguer)
js/dashboard.js                                Lógica da página de dashboard
js/trades-page.js                                Lógica da página de trades
js/import-page.js                                  Lógica da importação unificada (CSV/HTML/IA/OCR)
supabase/schema.sql                                    Schema do banco (rodar no Supabase)
netlify.toml                                             Config do Netlify (aponta pro dir. de functions)
netlify/functions/parse-trade-image.js                     Function que chama o Gemini com segurança
```
