# Casa Viva

App de orçamento doméstico que trata as finanças da casa como um organismo
vivo: cada "órgão" financeiro (Moradia, Alimentação, Transporte, Saúde,
Lazer, Dívidas, Reserva...) tem uma **saúde própria** — um termômetro
verde/amarelo/vermelho — em vez de planilhas frias de categorias. Focado em
uso compartilhado entre casais/famílias (household com múltiplos membros),
não só controle individual.

Site estático — HTML/CSS/JS puro, sem build step (Node não é necessário para
rodar). Backend é o Supabase (Postgres + Auth).

## Stack

- Frontend: HTML + CSS + JavaScript (ES modules), sem framework/bundler
- Backend: [Supabase](https://supabase.com) (Postgres, Auth com e-mail/senha
  e Google, Row Level Security)
- Deploy: [Netlify](https://netlify.com), com deploy automático a partir do
  GitHub (todo `git push` no branch `main` publica sozinho)

## Setup

### 1. Banco de dados (Supabase)

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto
   (ou reaproveite um existente).
2. No **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
   Isso cria `households`, `household_members`, `categories` (órgãos) e
   `expenses` (gastos), todas com Row Level Security por casa (cada usuário
   só vê os dados das casas de que participa).
   - Se o projeto já tinha tabelas de uma versão anterior (`trades`,
     `user_settings`), apague-as antes — tem o comando pronto no topo do
     arquivo de schema.
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

Depois acesse `http://localhost:5500/login.html`, crie uma conta — a
primeira casa é criada automaticamente com os 7 órgãos padrão.

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

## O que já está no MVP (Fase 1 — core loop)

- Cadastro/login por e-mail e senha, e login com Google (Supabase Auth)
- **Casa (household)** criada automaticamente no primeiro login, com os 7
  órgãos padrão (Moradia, Alimentação, Transporte, Saúde, Lazer, Dívidas,
  Reserva) — renomeáveis, e dá pra adicionar/remover outros
- **Termômetro de saúde por órgão** (verde / amarelo / vermelho), calculado
  em tempo real a partir dos gastos do mês vs. o acordo combinado. Os
  limiares de amarelo/vermelho são configuráveis por órgão (padrão 80%/100%)
- **Acordos renegociáveis**: cada órgão tem um valor combinado mensal
  editável a qualquer momento — não é um limite bloqueante, é um combinado
  que pode ser revisto
- **Cadastro de gastos**: valor, órgão, data, descrição, forma de pagamento —
  atualiza o termômetro na hora
- **Modelo multi-usuário**: schema já suporta várias pessoas na mesma casa
  (`household_members`), cada uma com um percentual de renda configurável
  (usado no futuro pra dividir contas fixas de forma proporcional, não
  50/50 por padrão). A tela de convite de outros membros ainda não existe —
  hoje cada usuário só vê a própria casa
- Dashboard "Raio-X": todos os órgãos visíveis de uma vez, com resumo de
  gasto total, combinado total, e quantos órgãos estão em alerta/estourados

## Fora do escopo deste MVP (próximas fases)

- **Fase 2**: efeito dominó (impacto projetado em outros objetivos quando um
  órgão estoura), radar de vampiros financeiros (gastos recorrentes e custo
  projetado em 12 meses)
- **Fase 3**: metas financeiras com foto que "revela" conforme o valor
  guardado aumenta; modo sobrevivência (sugestão automática de corte por
  órgão)
- **Fase 4**: convite de outros membros pra casa, sistema de negociação de
  acordos (notificação quando um órgão está prestes a estourar), split
  automático de contas fixas exibido como "sua parte: R$X"
- **Fase 5**: paywall (Free/Pro/Casal-Família) — hoje não há nenhum limite
  implementado
- Empacotamento como app mobile (PWA/Capacitor)

## Estrutura de arquivos

```
index.html              Dashboard Raio-X (todos os órgãos + termômetros)
login.html               Login / criação de conta (e-mail/senha + Google)
expenses.html              Cadastro e lista de gastos
css/style.css                Estilos (design tokens claro/escuro, termômetro)
js/config.js                   Credenciais do Supabase (preencher)
js/supabaseClient.js             Cliente Supabase
js/auth.js                         Login/logout/sessão (e-mail + Google)
js/nav.js                            Menu mobile (hambúrguer)
js/household.js                        Criação/obtenção da casa do usuário
js/categories.js                         CRUD de órgãos + cálculo do termômetro
js/expenses.js                             CRUD de gastos
js/dashboard.js                              Lógica do Raio-X
js/expenses-page.js                            Lógica da página de gastos
supabase/schema.sql                              Schema do banco (rodar no Supabase)
netlify.toml                                       Config do Netlify
```
