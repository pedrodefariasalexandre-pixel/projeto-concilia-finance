import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthenticatedUserId } from '../lib/useAuthenticatedUserId';
import { parseOfx, resolveCompetency } from '../domain/ofx';
import type { RawTransaction } from '../domain/ofx';
import { mergeByFitid } from '../domain/merge';
import { checkGrossSum, suggestIgnored } from '../domain/reconcile';
import type { GrossSumCheck } from '../domain/reconcile';
import { checkReimport, computeStatementSignature } from '../domain/signature';
import type { ReimportCheck } from '../domain/signature';
import { listAccounts } from '../lib/accounts';
import type { Account } from '../lib/accounts';
import { listCategories } from '../lib/categories';
import type { Category } from '../lib/categories';
import { listPeople } from '../lib/people';
import type { Person } from '../lib/people';
import { listMemoryRules } from '../lib/memoryRules';
import { listClosedMonthFingerprints } from '../lib/closedMonths';
import { listOpenImportFingerprints } from '../lib/openImportFingerprints';
import { importOfxTransactions } from '../lib/importTransactions';
import type { ImportTransactionInput } from '../lib/importTransactions';
import { buildReviewItem, RevisarImportacao } from './RevisarImportacao';
import type { ReviewItem } from './RevisarImportacao';
import './cadastros/Cadastros.css';
import './Importar.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'invalid-file'; message: string }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'review' }
  | { kind: 'success'; inserted: number };

type Resources = { accounts: Account[]; categories: Category[]; people: Person[] };

const EMPTY_RESOURCES: Resources = { accounts: [], categories: [], people: [] };

function groupRawByFitid(transactions: RawTransaction[]): Map<string, RawTransaction[]> {
  const groups = new Map<string, RawTransaction[]>();
  for (const raw of transactions) {
    const list = groups.get(raw.fitid) ?? [];
    list.push(raw);
    groups.set(raw.fitid, list);
  }
  return groups;
}

export function Importar() {
  const userId = useAuthenticatedUserId();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [competency, setCompetency] = useState<string | null>(null);
  const [grossSumCheck, setGrossSumCheck] = useState<GrossSumCheck | null>(null);
  const [reimportCheck, setReimportCheck] = useState<ReimportCheck | null>(null);
  const [resources, setResources] = useState<Resources>(EMPTY_RESOURCES);
  const [accountId, setAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetToIdle() {
    setPhase({ kind: 'idle' });
    setItems([]);
    setCompetency(null);
    setGrossSumCheck(null);
    setReimportCheck(null);
    setResources(EMPTY_RESOURCES);
    setAccountId('');
    setSubmitError(null);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.ofx') && !lowerName.endsWith('.txt')) {
      setPhase({ kind: 'invalid-file', message: 'Selecione um arquivo .ofx ou .txt.' });
      return;
    }

    setPhase({ kind: 'reading' });

    let text: string;
    try {
      text = await file.text();
    } catch {
      setPhase({ kind: 'invalid-file', message: 'Não foi possível ler o arquivo selecionado.' });
      return;
    }

    let statement: ReturnType<typeof parseOfx>;
    let merged: ReturnType<typeof mergeByFitid>;
    let gross: GrossSumCheck;
    let suggestions: boolean[];
    try {
      statement = parseOfx(text);
      if (statement.transactions.length === 0) {
        setPhase({ kind: 'empty' });
        return;
      }
      merged = mergeByFitid(statement.transactions);
      gross = checkGrossSum(statement.transactions, merged);
      suggestions = suggestIgnored(merged);
    } catch {
      setPhase({ kind: 'error', message: 'Não foi possível interpretar este arquivo. Verifique se é um OFX válido.' });
      return;
    }

    try {
      const [memoryRules, closedMonths, openFingerprints, accounts, categories, people] = await Promise.all([
        listMemoryRules(userId),
        listClosedMonthFingerprints(userId),
        listOpenImportFingerprints(userId),
        listAccounts(userId),
        listCategories(userId),
        listPeople(userId),
      ]);
      // R4 cobre meses fechados (closed_months) E importações anteriores ainda abertas
      // (reconstruídas de transactions já persistidas) — ver src/lib/openImportFingerprints.ts.
      const reimportFingerprints = [...closedMonths, ...openFingerprints];

      const rawGroups = groupRawByFitid(statement.transactions);
      const consumedByFitid = new Map<string, number>();

      const reviewItems = merged.map((mergedTx, index) => {
        const group = rawGroups.get(mergedTx.fitid) ?? [];
        let rawForItem: RawTransaction[];
        if (mergedTx.mergePending) {
          const consumed = consumedByFitid.get(mergedTx.fitid) ?? 0;
          rawForItem = group[consumed] ? [group[consumed]!] : [];
          consumedByFitid.set(mergedTx.fitid, consumed + 1);
        } else {
          rawForItem = group;
        }
        return buildReviewItem(rawForItem, mergedTx, memoryRules, suggestions[index] ?? false);
      });

      const signature = await computeStatementSignature(merged);
      void signature; // a assinatura em si não é exibida; checkReimport já a recalcula internamente
      const reimport = await checkReimport(merged, reimportFingerprints);

      setItems(reviewItems);
      setCompetency(resolveCompetency(statement));
      setGrossSumCheck(gross);
      setReimportCheck(reimport);
      setResources({ accounts, categories, people });
      setAccountId('');
      setSubmitError(null);
      setPhase({ kind: 'review' });
    } catch {
      setPhase({ kind: 'error', message: 'Não foi possível carregar os dados necessários para a revisão. Tente novamente.' });
    }
  }

  async function handleConfirm(payload: ImportTransactionInput[]) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await importOfxTransactions(payload);
      setPhase({ kind: 'success', inserted: result.inserted });
    } catch {
      setSubmitError('Não foi possível concluir a importação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="cadastro-page import-page">
      <div className="cadastro-header">
        <h1>Importar extrato</h1>
      </div>

      {(phase.kind === 'idle' || phase.kind === 'reading' || phase.kind === 'invalid-file' || phase.kind === 'empty' || phase.kind === 'error') && (
        <div className="import-picker">
          <div className="field">
            <label htmlFor="import-file">Arquivo OFX</label>
            <input
              id="import-file"
              type="file"
              accept=".ofx,.txt"
              onChange={(event) => void handleFileChange(event)}
              disabled={phase.kind === 'reading'}
            />
          </div>
          <p className="field-hint">
            {phase.kind === 'reading' ? 'Lendo arquivo...' : 'Aceita arquivos .ofx ou .txt exportados do banco/cartão.'}
          </p>

          {phase.kind === 'invalid-file' && (
            <p className="cadastro-page-error" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind === 'empty' && (
            <p className="cadastro-page-error" role="alert">
              Nenhum lançamento foi encontrado neste arquivo.
            </p>
          )}
          {phase.kind === 'error' && (
            <p className="cadastro-page-error" role="alert">
              {phase.message}
            </p>
          )}
        </div>
      )}

      {phase.kind === 'review' && grossSumCheck && reimportCheck && (
        <RevisarImportacao
          items={items}
          onItemsChange={setItems}
          competency={competency}
          grossSumCheck={grossSumCheck}
          reimportCheck={reimportCheck}
          accounts={resources.accounts}
          categories={resources.categories}
          people={resources.people}
          accountId={accountId}
          onAccountIdChange={setAccountId}
          submitting={submitting}
          submitError={submitError}
          onConfirm={(payload) => void handleConfirm(payload)}
        />
      )}

      {phase.kind === 'success' && (
        <div className="import-success">
          <p>{phase.inserted} lançamento(s) importado(s) com sucesso.</p>
          <button type="button" className="cadastro-primary" onClick={resetToIdle}>
            Importar outro arquivo
          </button>
          <Link to="/">Voltar ao início</Link>
        </div>
      )}
    </section>
  );
}
