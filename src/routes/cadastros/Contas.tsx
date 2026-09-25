import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthenticatedUserId } from '../../lib/useAuthenticatedUserId';
import { ACCOUNT_KINDS, createAccount, listAccounts, updateAccount } from '../../lib/accounts';
import type { Account, AccountKind } from '../../lib/accounts';
import { formatCents } from '../../domain/money';
import { MoneyInput } from '../../components/MoneyInput';
import './Cadastros.css';

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; accounts: Account[] };

const KIND_LABELS: Record<AccountKind, string> = {
  corrente: 'Conta corrente',
  dinheiro: 'Dinheiro',
  cartao_manual: 'Cartão (manual)',
};

export function Contas() {
  const userId = useAuthenticatedUserId();
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [editing, setEditing] = useState<Account | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('corrente');
  const [openingBalanceCents, setOpeningBalanceCents] = useState<number | null>(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void reload();
  }, [userId]);

  async function reload() {
    setListState({ status: 'loading' });
    try {
      const accounts = await listAccounts(userId);
      setListState({ status: 'loaded', accounts });
    } catch {
      setListState({ status: 'error' });
    }
  }

  function openCreateForm() {
    setEditing(null);
    setName('');
    setKind('corrente');
    setOpeningBalanceCents(0);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(account: Account) {
    setEditing(account);
    setName(account.name);
    setKind(account.kind);
    setOpeningBalanceCents(account.opening_balance_cents);
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Informe o nome da conta.');
      return;
    }
    if (openingBalanceCents === null) {
      setFormError('Informe um saldo inicial válido.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const input = { name: trimmedName, kind, opening_balance_cents: openingBalanceCents };

    try {
      if (editing) {
        await updateAccount(editing.id, input);
      } else {
        await createAccount(userId, input);
      }
      closeForm();
      await reload();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="cadastro-page">
      <div className="cadastro-header">
        <h1>Contas</h1>
        <button type="button" className="cadastro-primary" onClick={openCreateForm} disabled={formOpen}>
          Nova conta
        </button>
      </div>

      {formOpen && (
        <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
          <h2>{editing ? 'Editar conta' : 'Nova conta'}</h2>

          <div className="field">
            <label htmlFor="conta-name">Nome</label>
            <input
              id="conta-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
              autoFocus
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'conta-form-error' : undefined}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="conta-kind">Tipo</label>
              <select
                id="conta-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as AccountKind)}
                disabled={submitting}
              >
                {ACCOUNT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conta-balance">Saldo inicial (R$)</label>
              <MoneyInput
                key={editing?.id ?? 'new'}
                id="conta-balance"
                initialCents={openingBalanceCents}
                onChange={setOpeningBalanceCents}
                disabled={submitting}
                ariaInvalid={formError ? true : undefined}
                ariaDescribedBy={formError ? 'conta-form-error' : undefined}
              />
            </div>
          </div>

          {formError && (
            <p id="conta-form-error" className="error" role="alert">
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

      {listState.status === 'loading' && <p className="cadastro-loading">Carregando contas...</p>}

      {listState.status === 'error' && (
        <p className="cadastro-page-error">
          Não foi possível carregar as contas.{' '}
          <button type="button" onClick={() => void reload()}>
            Tentar novamente
          </button>
        </p>
      )}

      {listState.status === 'loaded' && listState.accounts.length === 0 && (
        <p className="cadastro-empty">Nenhuma conta cadastrada ainda.</p>
      )}

      {listState.status === 'loaded' && listState.accounts.length > 0 && (
        <ul className="cadastro-list">
          {listState.accounts.map((account) => (
            <li key={account.id} className="cadastro-item">
              <div className="cadastro-item-main">
                <span className="cadastro-item-title">{account.name}</span>
                <span className="cadastro-item-subtitle">
                  {KIND_LABELS[account.kind]} · {formatCents(account.opening_balance_cents)}
                </span>
              </div>
              <div className="cadastro-item-actions">
                <button type="button" onClick={() => openEditForm(account)}>
                  Editar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
