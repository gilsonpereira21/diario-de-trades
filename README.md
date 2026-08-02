# Diário de Trades com Psicologia

MVP de um diário de trades que, além das métricas de performance padrão
(win rate, risco/retorno, expectância, drawdown), registra o **estado
emocional antes/depois de cada operação** e alerta padrões destrutivos
(ex: revenge trading após perdas seguidas).

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
   Isso cria a tabela `trades` com Row Level Security (cada usuário só vê os
   próprios trades).
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

Sem essas variáveis configuradas, a página [screenshot.html](screenshot.html)
continua acessível mas a análise retorna erro.

## O que já está no MVP

- Cadastro/login por e-mail e senha, e login com Google (Supabase Auth)
- Registro manual de trades: ativo, lado, quantidade, preços de entrada/saída,
  stop loss, take profit, datas, notas
- Campo de **estado emocional antes e depois** de cada trade (confiante,
  ansioso, ganancioso, vingativo, medo, eufórico, cansado, neutro)
- Métricas automáticas: win rate, risco/retorno médio (R), expectância,
  resultado total, drawdown máximo
- Detecção de padrões comportamentais:
  - queda de performance depois de 2 perdas seguidas (revenge trading)
  - queda de performance associada a um estado emocional específico
  - aumento de tamanho de posição logo após uma perda
- Gráficos: curva de patrimônio acumulado, desempenho por ativo, desempenho
  por dia da semana
- Edição e exclusão de trades
- **Importação de CSV ou HTML** ([import.html](import.html)): sobe o extrato
  exportado da corretora (CSV, ou uma página HTML com uma tabela — ex: extrato
  salvo do navegador), mapeia as colunas (com sugestão automática de qual
  coluna é qual campo), confirma o significado de cada valor de "lado"
  (compra/venda) e importa tudo de uma vez. Aceita separador vírgula ou ponto
  e vírgula, números em formato BR (1.234,56) ou internacional (1,234.56), e
  datas em dd/mm/aaaa ou aaaa-mm-dd. Linhas com erro (data inválida, preço
  vazio etc.) são sinalizadas e ignoradas sem travar o restante da importação.
- **Leitura de print via IA** ([screenshot.html](screenshot.html)): sobe (ou
  cola com Ctrl+V) um print da corretora, e o Gemini extrai ativo, lado,
  preço, quantidade e datas. Os dados caem no formulário de trade pra revisão
  — nada é salvo sem confirmação manual, já que a IA pode errar leituras.

## Fora do escopo deste MVP (próximas fatias)

- Alertas em tempo real ("você está prestes a repetir seu padrão")
- Planos pagos / cobrança (Free vs Pro) — hoje o app não tem nenhum limite
  ou paywall implementado
- Empacotamento como app mobile (PWA/Capacitor)

## Estrutura de arquivos

```
index.html          Dashboard (métricas, gráficos, alertas de padrão)
login.html           Login / criação de conta (e-mail/senha + Google)
trades.html           Registro e lista de trades
import.html            Importação de CSV
screenshot.html          Importação de print via IA
css/style.css              Estilos (design tokens claro/escuro)
js/config.js                Credenciais do Supabase (preencher)
js/supabaseClient.js          Cliente Supabase
js/auth.js                     Login/logout/sessão (e-mail + Google)
js/metrics.js                    Cálculo de win rate, R:R, expectância, drawdown
js/patterns.js                     Detecção de padrões comportamentais
js/charts.js                         Gráficos SVG (linha e barras)
js/emotions.js                         Lista de estados emocionais
js/csv.js                                 Parser de CSV + normalização de números/datas/lado
js/nav.js                                    Menu mobile (hambúrguer)
js/dashboard.js                                Lógica da página de dashboard
js/trades-page.js                                Lógica da página de trades
js/import-page.js                                  Lógica da página de importação de CSV
js/screenshot-page.js                                Lógica da página de importação por IA
supabase/schema.sql                                    Schema do banco (rodar no Supabase)
netlify.toml                                             Config do Netlify (aponta pro dir. de functions)
netlify/functions/parse-trade-image.js                     Function que chama o Gemini com segurança
```
