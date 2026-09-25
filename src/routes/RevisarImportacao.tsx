import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { mergeByFitid } from '../domain/merge';
import type { MergedTransaction } from '../domain/merge';
import type { RawTransaction } from '../domain/ofx';
import { normalizeDescription } from '../domain/normalize';
import { matchMemoryRule } from '../domain/rules';
import type { MemoryMatch, MemoryRule } from '../domain/rules';
import { formatCents, splitEqual, sumCents } from '../domain/money';
import type { Cents } from '../domain/money';
import type { GrossSumCheck } from '../domain/reconcile';
import type { ReimportCheck } from '../domain/signature';
import type { Account } from '../lib/accounts';
import type { Category } from '../lib/categories';
import type { Person } from '../lib/people';
import type { ImportTransactionInput } from '../lib/importTransactions';
import { MoneyInput } from '../components/MoneyInput';
import './cadastros/Cadastros.css';
import './Importar.css';

export type ReviewItem = {
  key: string;
  raw: RawTransaction[];
  merged: MergedTransaction;
  categoryId: string;
  personIds: string[];
  shares: Record<string, Cents>;
  ignored: boolean;
  suggestedIgnored: boolean;
  memoryMatch: MemoryMatch | null;
};

let keyCounter = 0;
function newItemKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

function buildShares(personIds: string[], amountCents: Cents): Record<string, Cents> {
  if (personIds.length === 0) return {};
  if (personIds.length === 1) return { [personIds[0]!]: amountCents };
  const parts = splitEqual(amountCents, personIds.length);
  const shares: Record<string, Cents> = {};
  personIds.forEach((personId, index) => {
    shares[personId] = parts[index]!;
  });
  return shares;
}

export function buildReviewItem(
  raw: RawTransaction[],
  merged: MergedTransaction,
  memoryRules: MemoryRule[],
  suggestedIgnored: boolean,
): ReviewItem {
  const memoryMatch = matchMemoryRule(merged.description, merged.amountCents, memoryRules);
  const personIds = memoryMatch?.personIds ?? [];
  return {
    key: newItemKey(),
    raw,
    merged,
    categoryId: memoryMatch?.categoryId ?? '',
    personIds,
    shares: buildShares(personIds, merged.amountCents),
    ignored: suggestedIgnored,
    suggestedIgnored,
    memoryMatch,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function rateioInvalido(item: ReviewItem): boolean {
  if (item.personIds.length === 0) return false;
  return sumCents(Object.values(item.shares)) !== item.merged.amountCents;
}

type Props = {
  items: ReviewItem[];
  onItemsChange: (items: ReviewItem[]) => void;
  competency: string | null;
  grossSumCheck: GrossSumCheck;
  reimportCheck: ReimportCheck;
  accounts: Account[];
  categories: Category[];
  people: Person[];
  accountId: string;
  onAccountIdChange: (id: string) => void;
  submitting: boolean;
  submitError: string | null;
  onConfirm: (payload: ImportTransactionInput[]) => void;
};

export function RevisarImportacao({
  items,
  onItemsChange,
  competency,
  grossSumCheck,
  reimportCheck,
  accounts,
  categories,
  people,
  accountId,
  onAccountIdChange,
  submitting,
  submitError,
  onConfirm,
}: Props) {
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());

  const totalCents = useMemo(() => sumCents(items.map((item) => item.merged.amountCents)), [items]);
  const readyItems = items.filter((item) => !item.merged.mergePending);
  const pendingItems = items.filter((item) => item.merged.mergePending);

  const pendingGroups = useMemo(() => {
    const groups = new Map<string, ReviewItem[]>();
    for (const item of pendingItems) {
      const list = groups.get(item.merged.fitid) ?? [];
      list.push(item);
      groups.set(item.merged.fitid, list);
    }
    return groups;
  }, [pendingItems]);

  function updateItem(key: string, patch: Partial<ReviewItem>) {
    onItemsChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function togglePerson(item: ReviewItem, personId: string) {
    const personIds = item.personIds.includes(personId)
      ? item.personIds.filter((id) => id !== personId)
      : [...item.personIds, personId];
    updateItem(item.key, { personIds, shares: buildShares(personIds, item.merged.amountCents) });
  }

  function setShare(item: ReviewItem, personId: string, cents: number | null) {
    updateItem(item.key, { shares: { ...item.shares, [personId]: cents ?? 0 } });
  }

  function toggleMergeSelection(itemKey: string) {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  }

  function resolveManualMerge(fitid: string) {
    const group = pendingGroups.get(fitid) ?? [];
    const selected = group.filter((item) => mergeSelection.has(item.key));
    if (selected.length < 2 || selected.length > 3) return;

    const rawLines = selected.flatMap((item) => item.raw);
    const [mergedResult] = mergeByFitid(rawLines);
    if (!mergedResult) return;

    const newItem = buildReviewItem(rawLines, mergedResult, [], false);
    const selectedKeys = new Set(selected.map((item) => item.key));

    onItemsChange([...items.filter((item) => !selectedKeys.has(item.key)), newItem]);
    setMergeSelection((prev) => {
      const next = new Set(prev);
      selectedKeys.forEach((key) => next.delete(key));
      return next;
    });
  }

  const anyRateioInvalido = items.some(rateioInvalido);
  const blocked = !accountId || !grossSumCheck.matches || reimportCheck.exactMatch !== null || anyRateioInvalido || submitting;

  function selectablePeopleFor(item: ReviewItem): Person[] {
    const selected = new Set(item.personIds);
    return people.filter((person) => !person.archived || selected.has(person.id));
  }

  function handleConfirm() {
    if (blocked) return;

    const payload: ImportTransactionInput[] = items.map((item) => {
      const fromMemory =
        item.memoryMatch !== null &&
        item.categoryId === (item.memoryMatch.categoryId ?? '') &&
        sameSet(item.personIds, item.memoryMatch.personIds);

      return {
        accountId,
        competency,
        postedOn: item.merged.postedOn,
        amountCents: item.merged.amountCents,
        description: item.merged.description,
        descriptionNorm: normalizeDescription(item.merged.description),
        fitid: item.merged.fitid,
        installmentCurrent: item.merged.installment?.current ?? null,
        installmentTotal: item.merged.installment?.total ?? null,
        categoryId: item.categoryId || null,
        ignored: item.ignored,
        mergePending: item.merged.mergePending,
        fromMemory,
        people: item.personIds.map((personId) => ({ personId, shareCents: item.shares[personId] ?? 0 })),
      };
    });

    onConfirm(payload);
  }

  function renderRow(item: ReviewItem, mergeControls?: ReactNode) {
    const selectable = selectablePeopleFor(item);
    const shareSum = sumCents(Object.values(item.shares));
    const showSplitEditor = item.personIds.length >= 2;
    const invalid = rateioInvalido(item);

    return (
      <li key={item.key} className="import-item">
        {mergeControls}
        <div className="import-item-main">
          <div className="import-item-title">
            <span>{item.merged.description}</span>
            {item.merged.installment && (
              <span className="cadastro-badge">
                {item.merged.installment.current}/{item.merged.installment.total}
              </span>
            )}
            {item.memoryMatch && <span className="cadastro-badge import-badge-memory">Memória</span>}
            {item.suggestedIgnored && <span className="cadastro-badge">Sugestão: ignorar</span>}
          </div>
          <div className="import-item-subtitle">
            {item.merged.postedOn ?? 'sem data'} · {formatCents(item.merged.amountCents)}
            {item.merged.sourceLines && item.merged.sourceLines.length > 1
              ? ` · mesclado de ${item.merged.sourceLines.length} linhas (mesmo FITID)`
              : ''}
          </div>
        </div>

        <div className="import-item-fields">
          <div className="field">
            <label htmlFor={`cat-${item.key}`}>Categoria</label>
            <select
              id={`cat-${item.key}`}
              value={item.categoryId}
              onChange={(event) => updateItem(item.key, { categoryId: event.target.value })}
              disabled={submitting}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="field">
            <legend>Pessoas</legend>
            {selectable.map((person) => (
              <label key={person.id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={item.personIds.includes(person.id)}
                  onChange={() => togglePerson(item, person.id)}
                  disabled={submitting}
                />
                {person.name}
                {person.archived && <span className="cadastro-badge">Arquivada</span>}
              </label>
            ))}
            {selectable.length === 0 && <p className="field-hint">Nenhuma pessoa cadastrada.</p>}
          </fieldset>

          {showSplitEditor && (
            <div className="import-split-editor">
              {item.personIds.map((personId) => {
                const person = people.find((p) => p.id === personId);
                return (
                  <div className="field" key={personId}>
                    <label htmlFor={`share-${item.key}-${personId}`}>{person?.name ?? 'Pessoa removida'}</label>
                    <MoneyInput
                      key={item.personIds.join(',')}
                      id={`share-${item.key}-${personId}`}
                      initialCents={item.shares[personId] ?? 0}
                      onChange={(cents) => setShare(item, personId, cents)}
                      disabled={submitting}
                      ariaInvalid={invalid}
                    />
                  </div>
                );
              })}
              <p className={invalid ? 'error' : 'field-hint'} role={invalid ? 'alert' : undefined}>
                Soma do rateio: {formatCents(shareSum)} / {formatCents(item.merged.amountCents)}
              </p>
            </div>
          )}

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={item.ignored}
              onChange={(event) => updateItem(item.key, { ignored: event.target.checked })}
              disabled={submitting}
            />
            Ignorar este lançamento
          </label>
        </div>
      </li>
    );
  }

  return (
    <section className="import-review">
      <div className="import-summary">
        <p>
          Competência: <strong>{competency ?? 'não detectada'}</strong> · {items.length} lançamento(s) · Total:{' '}
          <strong>{formatCents(totalCents)}</strong>
        </p>
      </div>

      {!grossSumCheck.matches && (
        <p className="cadastro-page-error" role="alert">
          A soma pós-mesclagem ({grossSumCheck.mergedCount} itens) não bate com o arquivo original (
          {grossSumCheck.rawCount} itens): diferença de {formatCents(grossSumCheck.differenceCents)}. A importação foi
          bloqueada por segurança.
        </p>
      )}

      {reimportCheck.exactMatch && (
        <p className="cadastro-page-error" role="alert">
          Este extrato parece já ter sido importado integralmente (mês {reimportCheck.exactMatch.competency}).
        </p>
      )}

      {!reimportCheck.exactMatch && reimportCheck.partialMatch && (
        <p className="import-warning" role="alert">
          Parte deste extrato já apareceu no mês {reimportCheck.partialMatch.competency} (
          {Math.round(reimportCheck.partialMatch.overlapRatio * 100)}% de sobreposição). Você pode importar mesmo
          assim.
        </p>
      )}

      <div className="field import-account-field">
        <label htmlFor="import-account">Conta de destino</label>
        <select
          id="import-account"
          value={accountId}
          onChange={(event) => onAccountIdChange(event.target.value)}
          disabled={submitting || accounts.length === 0}
        >
          <option value="">Selecione uma conta</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {accounts.length === 0 && <p className="field-hint">Cadastre uma conta em "Contas" antes de importar.</p>}
      </div>

      {readyItems.length > 0 && (
        <>
          <h2>Lançamentos</h2>
          <ul className="import-list">{readyItems.map(renderRow)}</ul>
        </>
      )}

      {pendingItems.length > 0 && (
        <>
          <h2>Pendentes de revisão manual</h2>
          <p className="field-hint">
            Grupos com 4 ou mais linhas do mesmo FITID não são mesclados automaticamente. Selecione 2 ou 3 linhas do
            mesmo grupo para mesclar manualmente, ou importe cada uma separadamente.
          </p>
          {Array.from(pendingGroups.entries()).map(([fitid, group]) => {
            const selectedInGroup = group.filter((item) => mergeSelection.has(item.key)).length;
            return (
              <div key={fitid} className="import-pending-group">
                <ul className="import-list">
                  {group.map((item) =>
                    renderRow(
                      item,
                      <label className="checkbox-field import-merge-checkbox">
                        <input
                          type="checkbox"
                          checked={mergeSelection.has(item.key)}
                          onChange={() => toggleMergeSelection(item.key)}
                          disabled={submitting}
                        />
                        Selecionar para mesclar manualmente
                      </label>,
                    ),
                  )}
                </ul>
                <button
                  type="button"
                  onClick={() => resolveManualMerge(fitid)}
                  disabled={submitting || selectedInGroup < 2 || selectedInGroup > 3}
                >
                  Mesclar selecionadas ({selectedInGroup})
                </button>
              </div>
            );
          })}
        </>
      )}

      {submitError && (
        <p className="cadastro-page-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="import-confirm-actions">
        <button type="button" onClick={handleConfirm} disabled={blocked} className="cadastro-primary">
          {submitting ? 'Importando...' : 'Confirmar importação'}
        </button>
      </div>
    </section>
  );
}
