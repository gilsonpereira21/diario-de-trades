# Diário de Trades com Psicologia

MVP de um diário de trades que, além das métricas de performance padrão
(win rate, risco/retorno, expectância, drawdown), registra o **estado
emocional antes/depois de cada operação** e alerta padrões destrutivos
(ex: revenge trading após perdas seguidas).

Site estático — HTML/CSS/JS puro, sem build step (Node não é necessário para
rodar). Backend é o Supabase (Postgres + Auth).

## Stack

- Frontend: HTML + CSS + JavaScript (ES modules), sem framework/bundler
- Gráficos: SVG desenhado à mão (curva de patrimônio, desempenho por ativo/dia)
- Backend: [Supabase](https://supabase.com) (Postgres, Auth, Row Level Security)

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

## O que já está no MVP

- Cadastro/login por e-mail e senha (Supabase Auth)
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
- **Importação de CSV** ([import.html](import.html)): sobe o extrato exportado
  da corretora, mapeia as colunas (com sugestão automática de qual coluna é
  qual campo), confirma o significado de cada valor de "lado" (compra/venda)
  e importa tudo de uma vez. Aceita separador vírgula ou ponto e vírgula,
  números em formato BR (1.234,56) ou internacional (1,234.56), e datas em
  dd/mm/aaaa ou aaaa-mm-dd. Linhas com erro (data inválida, preço vazio etc.)
  são sinalizadas e ignoradas sem travar o restante da importação.

## Fora do escopo deste MVP (próximas fatias)

- Leitura de print de operação via IA
- Alertas em tempo real ("você está prestes a repetir seu padrão")
- Planos pagos / cobrança (Free vs Pro) — hoje o app não tem nenhum limite
  ou paywall implementado
- Empacotamento como app mobile (PWA/Capacitor)

## Estrutura de arquivos

```
index.html          Dashboard (métricas, gráficos, alertas de padrão)
login.html           Login / criação de conta
trades.html           Registro e lista de trades
import.html            Importação de CSV
css/style.css          Estilos (design tokens claro/escuro)
js/config.js            Credenciais do Supabase (preencher)
js/supabaseClient.js      Cliente Supabase
js/auth.js                 Login/logout/sessão
js/metrics.js                Cálculo de win rate, R:R, expectância, drawdown
js/patterns.js                 Detecção de padrões comportamentais
js/charts.js                    Gráficos SVG (linha e barras)
js/emotions.js                   Lista de estados emocionais
js/csv.js                          Parser de CSV + normalização de números/datas/lado
js/dashboard.js                    Lógica da página de dashboard
js/trades-page.js                   Lógica da página de trades
js/import-page.js                    Lógica da página de importação
supabase/schema.sql                  Schema do banco (rodar no Supabase)
```
