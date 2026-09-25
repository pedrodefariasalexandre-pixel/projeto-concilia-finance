import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthenticatedUserId } from '../../lib/useAuthenticatedUserId';
import {
  createFixedCharge,
  deleteFixedCharge,
  listFixedCharges,
  updateFixedCharge,
} from '../../lib/fixedCharges';
import type { FixedCharge } from '../../lib/fixedCharges';
import { listCategories } from '../../lib/categories';
import type { Category } from '../../lib/categories';
import { listPeople } from '../../lib/people';
import type { Person } from '../../lib/people';
import { formatCents } from '../../domain/money';
import { MoneyInput } from '../../components/MoneyInput';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import './Cadastros.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; charges: FixedCharge[]; categories: Category[]; people: Person[] };

type FormState = {
  description: string;
  amountCents: number | null;
  categoryId: string;
  personIds: string[];
  installmentCurrent: string;
  installmentTotal: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  description: '',
  amountCents: null,
  categoryId: '',
  personIds: [],
  installmentCurrent: '',
  installmentTotal: '',
  active: true,
};

function parseInstallment(raw: string): number | null | 'invalid' {
  if (!raw.trim()) return null;
  if (!/^\d+$/.test(raw.trim())) return 'invalid';
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) return 'invalid';
  return value;
}

export function CobrancasFixas() {
  const userId = useAuthenticatedUserId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState<FixedCharge | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FixedCharge | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, [userId]);

  async function reload() {
    setState({ status: 'loading' });
    try {
      const [charges, categories, people] = await Promise.all([
        listFixedCharges(userId),
        listCategories(userId),
        listPeople(userId),
      ]);
      setState({ status: 'loaded', charges, categories, people });
    } catch {
      setState({ status: 'error' });
    }
  }

  const categoriesById = useMemo(() => {
    if (state.status !== 'loaded') return new Map<string, Category>();
    return new Map(state.categories.map((category) => [category.id, category]));
  }, [state]);

  const peopleById = useMemo(() => {
    if (state.status !== 'loaded') return new Map<string, Person>();
    return new Map(state.people.map((person) => [person.id, person]));
  }, [state]);

  const selectablePeople = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const selectedIds = new Set(form.personIds);
    return state.people.filter((person) => !person.archived || selectedIds.has(person.id));
  }, [state, form.personIds]);

  function openCreateForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(charge: FixedCharge) {
    setEditing(charge);
    setForm({
      description: charge.description,
      amountCents: charge.amount_cents,
      categoryId: charge.category_id ?? '',
      personIds: charge.person_ids,
      installmentCurrent: charge.installment_current === null ? '' : String(charge.installment_current),
      installmentTotal: charge.installment_total === null ? '' : String(charge.installment_total),
      active: charge.active,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function togglePerson(personId: string) {
    setForm((prev) => ({
      ...prev,
      personIds: prev.personIds.includes(personId)
        ? prev.personIds.filter((id) => id !== personId)
        : [...prev.personIds, personId],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const description = form.description.trim();
    if (!description) {
      setFormError('Informe a descrição.');
      return;
    }

    if (form.amountCents === null) {
      setFormError('Informe um valor válido.');
      return;
    }

    const current = parseInstallment(form.installmentCurrent);
    const total = parseInstallment(form.installmentTotal);

    if (current === 'invalid' || total === 'invalid') {
      setFormError('Parcelas devem ser números inteiros positivos.');
      return;
    }

    if ((current === null) !== (total === null)) {
      setFormError('Informe a parcela atual e o total de parcelas juntos, ou deixe ambos em branco.');
      return;
    }

    if (current !== null && total !== null && current > total) {
      setFormError('A parcela atual não pode ser maior que o total de parcelas.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const input = {
      description,
      amount_cents: form.amountCents,
      category_id: form.categoryId || null,
      person_ids: form.personIds,
      installment_current: current,
      installment_total: total,
      active: form.active,
    };

    try {
      if (editing) {
        await updateFixedCharge(editing.id, input);
      } else {
        await createFixedCharge(userId, input);
      }
      closeForm();
      await reload();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setActionBusyId(pendingDelete.id);
    try {
      await deleteFixedCharge(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch {
      setActionError('Não foi possível excluir a cobrança fixa. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className="cadastro-page">
      <div className="cadastro-header">
        <h1>Cobranças fixas</h1>
        <button type="button" className="cadastro-primary" onClick={openCreateForm} disabled={formOpen}>
          Nova cobrança
        </button>
      </div>

      {actionError && <p className="cadastro-page-error">{actionError}</p>}

      {formOpen && state.status === 'loaded' && (
        <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
          <h2>{editing ? 'Editar cobrança fixa' : 'Nova cobrança fixa'}</h2>

          <div className="field">
            <label htmlFor="cf-description">Descrição</label>
            <input
              id="cf-description"
              type="text"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={submitting}
              autoFocus
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'cf-form-error' : undefined}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="cf-amount">Valor (R$)</label>
              <MoneyInput
                key={editing?.id ?? 'new'}
                id="cf-amount"
                initialCents={form.amountCents}
                onChange={(cents) => setForm((prev) => ({ ...prev, amountCents: cents }))}
                disabled={submitting}
                ariaInvalid={formError ? true : undefined}
                ariaDescribedBy={formError ? 'cf-form-error' : undefined}
              />
            </div>
            <div className="field">
              <label htmlFor="cf-category">Categoria</label>
              <select
                id="cf-category"
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                disabled={submitting}
              >
                <option value="">Sem categoria</option>
                {state.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="cf-installment-current">Parcela atual</label>
              <input
                id="cf-installment-current"
                type="number"
                min={1}
                step={1}
                value={form.installmentCurrent}
                onChange={(event) => setForm((prev) => ({ ...prev, installmentCurrent: event.target.value }))}
                disabled={submitting}
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? 'cf-form-error' : undefined}
              />
            </div>
            <div className="field">
              <label htmlFor="cf-installment-total">Total de parcelas</label>
              <input
                id="cf-installment-total"
                type="number"
                min={1}
                step={1}
                value={form.installmentTotal}
                onChange={(event) => setForm((prev) => ({ ...prev, installmentTotal: event.target.value }))}
                disabled={submitting}
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? 'cf-form-error' : undefined}
              />
            </div>
          </div>
          <p className="field-hint">Deixe as duas parcelas em branco se a cobrança não for parcelada.</p>

          <fieldset className="field">
            <legend>Pessoas</legend>
            {selectablePeople.map((person) => (
              <label key={person.id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.personIds.includes(person.id)}
                  onChange={() => togglePerson(person.id)}
                  disabled={submitting}
                />
                {person.name}
                {person.archived && <span className="cadastro-badge">Arquivada</span>}
              </label>
            ))}
            {selectablePeople.length === 0 && <p className="field-hint">Nenhuma pessoa disponível.</p>}
          </fieldset>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
              disabled={submitting}
            />
            Ativa
          </label>

          {formError && (
            <p id="cf-form-error" className="error" role="alert">
              {formError}
            </p>
          )}

          <div className="cadastro-form-actions">
            <button type="button" onClick={closeForm} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p className="cadastro-loading">Carregando cobranças fixas...</p>}

      {state.status === 'error' && (
        <p className="cadastro-page-error">
          Não foi possível carregar as cobranças fixas.{' '}
          <button type="button" onClick={() => void reload()}>
            Tentar novamente
          </button>
        </p>
      )}

      {state.status === 'loaded' && state.charges.length === 0 && (
        <p className="cadastro-empty">Nenhuma cobrança fixa cadastrada ainda.</p>
      )}

      {state.status === 'loaded' && state.charges.length > 0 && (
        <ul className="cadastro-list">
          {state.charges.map((charge) => (
            <li key={charge.id} className={charge.active ? 'cadastro-item' : 'cadastro-item is-inactive'}>
              <div className="cadastro-item-main">
                <span className="cadastro-item-title">
                  {charge.description}
                  {!charge.active && <span className="cadastro-badge">Inativa</span>}
                </span>
                <span className="cadastro-item-subtitle">
                  {formatCents(charge.amount_cents)}
                  {charge.category_id && categoriesById.get(charge.category_id)
                    ? ` · ${categoriesById.get(charge.category_id)!.name}`
                    : ''}
                  {charge.installment_current !== null && charge.installment_total !== null
                    ? ` · ${charge.installment_current}/${charge.installment_total}`
                    : ''}
                  {charge.person_ids.length > 0
                    ? ` · ${charge.person_ids
                        .map((id) => peopleById.get(id)?.name ?? 'Pessoa removida')
                        .join(', ')}`
                    : ''}
                </span>
              </div>
              <div className="cadastro-item-actions">
                <button type="button" onClick={() => openEditForm(charge)} disabled={actionBusyId === charge.id}>
                  Editar
                </button>
                <button
                  type="button"
                  className="destructive"
                  onClick={() => setPendingDelete(charge)}
                  disabled={actionBusyId === charge.id}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Excluir cobrança fixa"
          description={`Excluir "${pendingDelete.description}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          destructive
          busy={actionBusyId === pendingDelete.id}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
