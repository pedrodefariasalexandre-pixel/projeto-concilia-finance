# Concilia v3 — Handoff pra nova sessão (2026-09-24)

Cole este arquivo (ou aponte pra ele) no início de um chat novo do Claude Code pra retomar exatamente daqui, sem re-explicar nada.

## O que é isto

Pivot do projeto Concilia: deixa de ser só "dividir fatura entre 3 pessoas" e vira **app de finanças pessoal completo, uso individual** (só o Pedro loga; "Pedro/Nega/Sogro" são tags dentro do lançamento de cartão, não contas de login). Repo construído **do zero**, mas reaproveitando como referência o domínio financeiro já validado no projeto Concilia antigo.

## Fonte de verdade dos requisitos

Documento completo (não repetir aqui, ler direto):
`C:\Claude Code\projeto-concilia\docs\product\CONCILIA_REQUISITOS_V3_APP_FINANCAS.md`

Cobre: objetivo, usuário, fontes de dado, prioridade de módulos (P0/P1/P2), requisitos funcionais R1-R6 (merge FITID, memória, histórico, bloqueio de reimportação, conferência de soma, PWA), segurança/privacidade, fora de escopo, decisões fechadas e stack.

## Decisões fechadas (não reabrir sem motivo novo)

- Repo novo do zero: `C:\Claude Code\concilia-financas`. Não herda estrutura/histórico do `projeto-concilia`, só o domínio como referência revalidada com teste próprio.
- Stack: React + TypeScript + Vite + Supabase (Postgres/Auth/RLS) + Vercel, PWA.
- OFX bruto **nunca** vai pro banco — só lançamento estruturado + assinatura de dedup.
- Login (Supabase Auth) + trava PIN/biometria + hardening de frontend = **P0**, obrigatório desde a primeira versão usável.
- `rateio-pwa` (https://rateio-pwa.vercel.app) fica de lado, intocado.
- Sem LLM/IA generativa (custo zero) e sem lançamento por foto — fora de escopo por decisão explícita.
- Tentativa de construir pelo Lovable foi abortada (ficou sem crédito no meio, telas faltando). Pedro pediu pro Claude Code executar tudo diretamente a partir daqui.

## Estado atual do código

`concilia-financas` (Vite + React + TS + vitest + `@supabase/supabase-js` + `react-router-dom`; git local, **sem remoto**):

- **Domínio financeiro completo e testado** em `src/domain/` — 69/69 testes verdes, typecheck limpo:
  - `money.ts` — centavos inteiros, `splitEqual` com resto determinístico, parse de valor pt-BR/OFX.
  - `normalize.ts` — normalização de descrição + chave de memória (nome+valor).
  - `ofx.ts` — parser tolerante (SGML sem fechamento, XML, BOM, CRLF/LF), competência via DTSTART/DTEND com fallback.
  - `merge.ts` — merge por FITID (2-3 linhas soma automática escolhendo descrição não-encargo; 4+ fica pendente) + detecção de parcela "N/M".
  - `reconcile.ts` — conferência de soma bruta pós-merge + sugestão inicial de ignorado (sinal oposto/palavra-chave).
  - `signature.ts` — hash SHA-256 determinístico da lista canônica pós-merge, pra bloquear reimportação (match total bloqueia, parcial >50% só avisa).
  - `rules.ts` — regras de memória por nome normalizado+valor exato, CRUD individual (nunca "apagar tudo").
- Schema SQL pronto: `supabase/migrations/0001_init.sql` — people, categories, accounts, transactions, transaction_people, memory_rules, fixed_charges, closed_months, app_settings (PIN em hash). RLS por `auth.uid()` em toda tabela.
- `src/lib/supabaseClient.ts` já criado, lê `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`.env.example` tem o template).
- Rodar testes: `npm test`. Typecheck: `npx tsc --noEmit`.

## Bloqueio no momento do handoff

Sem `gh` CLI, sem MCP de Supabase, sem credencial nesta máquina/sessão — não dá pra criar projeto Supabase nem repo GitHub sozinho. Precisa do Pedro:

1. Criar projeto Supabase grátis (região `sa-east-1` se disponível).
2. Rodar `supabase/migrations/0001_init.sql` no SQL Editor do projeto.
3. Passar **Project URL** e **anon public key** (Settings → API) — seguro de compartilhar, protegido por RLS, não é segredo.

## Próximos passos, em ordem

1. Wire do `.env` com as credenciais do Supabase (assim que o Pedro passar).
2. Telas de login + trava PIN (P0 — nada mais é construído antes disso funcionar).
3. Dashboard (saldo consolidado), cadastros (pessoas/categorias/contas/cobranças fixas), import+revisão de OFX, tela de fatura/rateio com mensagem+WhatsApp, fechamento de mês, histórico, ajustes (export JSON, apagar dados, lista de regras).
4. PWA: manifest + service worker (cache só do shell, nunca dado financeiro).
5. Repo GitHub (quando o Pedro decidir) + deploy Vercel.

Critério de pronto que nunca é negociável: soma das partes de um lançamento == valor original, soma de todas as pessoas == total do mês. Nenhuma tela é aceita como pronta se isso quebrar.

## Nota de ambiente

Nesta máquina, `node`/`npm` funcionam direto no Bash (Git Bash), sem precisar do refresh de PATH que o PowerShell exige em outros projetos do Pedro.
