# Prompts pra colar no VS Code (Claude Code / Copilot)

Cada bloco abaixo é autocontido — pode colar direto no agente do VS Code, um de cada vez, na ordem. Rode `npm test` e `npx tsc --noEmit` depois de cada etapa antes de seguir pra próxima.

Contexto fixo que vale pra todos os prompts (não precisa colar, mas o agente vai ler o repo):
- Requisitos completos: `C:\Claude Code\projeto-concilia\docs\product\CONCILIA_REQUISITOS_V3_APP_FINANCAS.md`
- Domínio financeiro pronto e testado em `src/domain/` (money, normalize, ofx, merge, reconcile, signature, rules) — reusar, não duplicar lógica.
- `src/lib/supabaseClient.ts` já existe e lê `.env` (já configurado).
- Schema Postgres em `supabase/migrations/0001_init.sql`: people, categories, accounts, transactions, transaction_people, memory_rules, fixed_charges, closed_months, app_settings. RLS por `auth.uid()` em tudo.
- Critério de pronto inegociável: soma das partes de um lançamento == valor original; soma de todas as pessoas == total do mês. Nenhuma tela é aceita se isso quebrar.
- Stack: React 19 + TypeScript + Vite + react-router-dom + vitest + Supabase JS.

---

## Prompt 1 — Auth (login) + guarda de rota

Implemente autenticação no app `concilia-financas` (React + TS + Vite + Supabase, `src/lib/supabaseClient.ts` já existe).

Requisitos:
- Tela `src/routes/Login.tsx`: formulário email+senha, chama `supabase.auth.signInWithPassword`. Sem cadastro público — o único usuário é criado manualmente no painel do Supabase Auth.
- `src/routes/ProtectedRoute.tsx`: componente de guarda que usa `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange` pra saber se há sessão ativa; redireciona pra `/login` se não houver.
- Configurar `react-router-dom` em `src/main.tsx` ou `src/App.tsx` com rotas: `/login` (pública) e o resto do app atrás de `ProtectedRoute`.
- Botão de logout (`supabase.auth.signOut()`) visível em algum lugar do layout autenticado.
- Sem lógica de cadastro/reset de senha por enquanto — só login.
- Escreva testes de comportamento do `ProtectedRoute` (mock do client Supabase) cobrindo: sem sessão → redireciona; com sessão → renderiza filhos.

---

## Prompt 2 — Trava PIN pós-login

Adicione uma trava de PIN numérico como segunda camada de segurança, depois do login Supabase.

Requisitos:
- Tabela `app_settings` já existe (`pin_hash`, `pin_salt`, `inactivity_minutes`). Gere hash do PIN no cliente antes de salvar (Web Crypto `crypto.subtle.digest`, nunca texto puro em lugar nenhum, nem em log).
- `src/routes/PinSetup.tsx`: se o usuário logado não tem `pin_hash` em `app_settings`, força cadastro de PIN de 4-6 dígitos antes de liberar o app.
- `src/routes/PinLock.tsx`: tela de desbloqueio por PIN, mostrada a cada novo carregamento da sessão E depois de `inactivity_minutes` de inatividade (usar listener de `visibilitychange`/timer de atividade).
- Integrar ao `ProtectedRoute` do Prompt 1: sessão Supabase válida mas PIN não destravado nesta carga = mostra `PinLock`, não o app.
- Estado de "destravado" fica só em memória (não persistir em localStorage) — recarregar a página deve pedir PIN de novo.
- Testes: hash determinístico pro mesmo PIN+salt, geração de salt aleatório, fluxo setup vs lock.

---

## Prompt 3 — Cadastros base (pessoas, categorias, contas, cobranças fixas)

Crie as telas de CRUD simples pros cadastros que os outros módulos vão referenciar.

Requisitos:
- `src/routes/cadastros/Pessoas.tsx` — CRUD sobre tabela `people` (name, phone, color, archived). Arquivar em vez de apagar se tiver lançamento vinculado.
- `src/routes/cadastros/Categorias.tsx` — CRUD sobre `categories` (name).
- `src/routes/cadastros/Contas.tsx` — CRUD sobre `accounts` (name, kind: corrente/dinheiro/cartao_manual, opening_balance_cents — exibir em reais, converter pra centavos ao salvar usando `src/domain/money.ts`).
- `src/routes/cadastros/CobrancasFixas.tsx` — CRUD sobre `fixed_charges` (description, amount_cents, category_id, person_ids, installment_current/total, active).
- Todo formulário de valor em dinheiro usa os helpers de `src/domain/money.ts` pra parse/format pt-BR — não reimplementar.
- Cada query já vem filtrada por RLS (auth.uid()), não precisa filtrar `user_id` manualmente no client, só não esquecer de setar `user_id: session.user.id` nos inserts.
- Testes: pelo menos o parse/format de valor em cada formulário e um teste de que arquivar pessoa não deixa ela sumir de lançamentos já existentes.

---

## Prompt 4 — Import de OFX + tela de revisão

Construa o fluxo de importar um extrato OFX e revisar antes de gravar.

Requisitos:
- `src/routes/Importar.tsx`: input de arquivo `.ofx`/`.txt`, lê como texto, passa pro parser `src/domain/ofx.ts` (já existe e é tolerante a SGML/XML/BOM/CRLF).
- Depois do parse, rodar `src/domain/merge.ts` pra juntar linhas por FITID (2-3 linhas soma automática; 4+ fica marcado `merge_pending` pra revisão manual) e detectar parcelas N/M.
- Rodar `src/domain/signature.ts` sobre a lista pós-merge ANTES de gravar: se já existe um `closed_months` ou import anterior com assinatura igual (match total), bloquear reimport com mensagem clara; se match parcial >50%, avisar mas permitir seguir.
- Tela de revisão (`src/routes/RevisarImportacao.tsx` ou dentro da mesma rota): lista cada lançamento pendente, permite editar categoria/pessoas/valor antes de confirmar, usa `src/domain/reconcile.ts` pra sugerir quais linhas são prováveis "ignorado" (ex.: pagamento de fatura, estorno).
- Confirmar a importação grava em `transactions` com `source: 'ofx'`, preenchendo `fitid`, `description_norm` (via `src/domain/normalize.ts`), `installment_current/total` quando detectado.
- Aplicar `memory_rules` automaticamente: se `rule_key` (nome normalizado + valor) já tem regra salva, pré-preencher categoria/pessoas da linha importada com o que a regra diz, marcando `from_memory: true`.
- Testes: fluxo completo com um arquivo OFX de exemplo (pode ser fixture pequena) cobrindo merge, bloqueio de reimportação e aplicação de memória.

---

## Prompt 5 — Dashboard + fatura/rateio

Construa o dashboard principal e a tela de fechamento de fatura por pessoa.

Requisitos:
- `src/routes/Dashboard.tsx`: saldo consolidado do mês corrente (soma de `transactions` não ignoradas do competency atual, por conta), atalho pra importar e pra ver pendências (`merge_pending` ou sem categoria/pessoa definida).
- `src/routes/Fatura.tsx`: agrupa lançamentos do mês por pessoa (via `transaction_people`), mostra total por pessoa e o total geral. Botão "gerar mensagem" que monta um texto formatado (lista de itens + valor por pessoa) pronto pra copiar ou abrir link `wa.me` com o texto pré-preenchido.
- Validação obrigatória antes de qualquer fechamento: soma de `share_cents` de todas as `transaction_people` de um lançamento tem que bater exatamente com `amount_cents` do lançamento (usar `splitEqual` de `src/domain/money.ts` pra sugerir divisão, mas permitir edição manual que ainda bata o total). Bloquear fechamento se não bater — sem exceção.
- Testes: geração de mensagem com dados fixos, validação de soma batendo/não batendo.

---

## Prompt 6 — Fechamento de mês + histórico

Requisitos:
- `src/routes/FecharMes.tsx`: ação que roda a validação de soma (mesma regra do Prompt 5) sobre TODOS os lançamentos do competency, e só permite fechar se soma das partes == total do mês inteiro. Ao fechar: grava snapshot completo em `closed_months` (competency, signature via `src/domain/signature.ts`, item_keys, total_cents, snapshot jsonb com todos os lançamentos), marca as `transactions` daquele competency como `closed: true`.
- Mês fechado vira somente-leitura — nenhuma tela deve permitir editar lançamento com `closed: true`.
- `src/routes/Historico.tsx`: lista `closed_months` por competency, ao abrir um mês mostra o snapshot congelado (não a tabela `transactions` ao vivo).
- Testes: fechar mês com soma batendo grava snapshot correto; tentar fechar com soma quebrada é rejeitado; editar lançamento fechado é bloqueado.

---

## Prompt 7 — Ajustes + PWA

Requisitos:
- `src/routes/Ajustes.tsx`: export de todos os dados do usuário em JSON (todas as tabelas filtradas por `auth.uid()`, já garantido pela RLS), botão de apagar todos os dados (confirmação dupla, nunca "apagar tudo" com um clique só), lista de `memory_rules` com CRUD individual (nunca bulk-delete).
- Trocar `inactivity_minutes` da trava PIN (Prompt 2) também fica aqui.
- PWA: `vite-plugin-pwa` (ou manifest manual + service worker simples), cache SÓ do shell estático (JS/CSS/HTML/ícones) — nunca cachear resposta de API/dado financeiro. `manifest.json` com nome, ícones, `display: standalone`.
- Testes: export JSON tem todas as tabelas esperadas; apagar dados exige as duas confirmações antes de disparar delete.
