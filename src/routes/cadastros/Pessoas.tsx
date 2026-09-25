import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthenticatedUserId } from '../../lib/useAuthenticatedUserId';
import {
  createPerson,
  deletePerson,
  listPeople,
  personIsReferenced,
  setPersonArchived,
  updatePerson,
} from '../../lib/people';
import type { Person } from '../../lib/people';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import './Cadastros.css';

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; people: Person[] };

type PendingAction =
  | { kind: 'archive'; person: Person }
  | { kind: 'delete'; person: Person }
  | { kind: 'delete-blocked'; person: Person };

type FormState = { name: string; phone: string; color: string };

const EMPTY_FORM: FormState = { name: '', phone: '', color: '' };

export function Pessoas() {
  const userId = useAuthenticatedUserId();
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [editing, setEditing] = useState<Person | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, [userId]);

  async function reload() {
    setListState({ status: 'loading' });
    try {
      const people = await listPeople(userId);
      setListState({ status: 'loaded', people });
    } catch {
      setListState({ status: 'error' });
    }
  }

  function openCreateForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(person: Person) {
    setEditing(person);
    setForm({ name: person.name, phone: person.phone ?? '', color: person.color ?? '' });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const name = form.name.trim();
    if (!name) {
      setFormError('Informe o nome.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const input = {
      name,
      phone: form.phone.trim() || null,
      color: form.color.trim() || null,
    };

    try {
      if (editing) {
        await updatePerson(editing.id, input);
      } else {
        await createPerson(userId, input);
      }
      closeForm();
      await reload();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleArchived(person: Person) {
    if (actionBusyId) return;
    setActionError(null);
    setActionBusyId(person.id);
    try {
      await setPersonArchived(person.id, !person.archived);
      await reload();
    } catch {
      setActionError('Não foi possível atualizar a pessoa. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDeleteClick(person: Person) {
    if (actionBusyId) return;
    setActionError(null);
    setActionBusyId(person.id);
    try {
      const referenced = await personIsReferenced(person.id);
      setPendingAction(referenced ? { kind: 'delete-blocked', person } : { kind: 'delete', person });
    } catch {
      setActionError('Não foi possível verificar vínculos da pessoa. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const { person } = pendingAction;
    setActionBusyId(person.id);
    try {
      if (pendingAction.kind === 'delete') {
        await deletePerson(person.id);
      } else {
        // 'delete-blocked': lançamentos vinculados existem — nunca excluir, arquivar para preservar o histórico.
        await setPersonArchived(person.id, true);
      }
      setPendingAction(null);
      await reload();
    } catch {
      setActionError('Não foi possível concluir a ação. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className="cadastro-page">
      <div className="cadastro-header">
        <h1>Pessoas</h1>
        <button type="button" className="cadastro-primary" onClick={openCreateForm} disabled={formOpen}>
          Nova pessoa
        </button>
      </div>

      {actionError && <p className="cadastro-page-error">{actionError}</p>}

      {formOpen && (
        <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
          <h2>{editing ? 'Editar pessoa' : 'Nova pessoa'}</h2>

          <div className="field">
            <label htmlFor="pessoa-name">Nome</label>
            <input
              id="pessoa-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={submitting}
              autoFocus
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'pessoa-form-error' : undefined}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="pessoa-phone">Telefone</label>
              <input
                id="pessoa-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="pessoa-color">Cor</label>
              <input
                id="pessoa-color"
                type="text"
                placeholder="#aa3bff"
                value={form.color}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                disabled={submitting}
              />
            </div>
          </div>

          {formError && (
            <p id="pessoa-form-error" className="error" role="alert">
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

      {listState.status === 'loading' && <p className="cadastro-loading">Carregando pessoas...</p>}

      {listState.status === 'error' && (
        <p className="cadastro-page-error">
          Não foi possível carregar as pessoas.{' '}
          <button type="button" onClick={() => void reload()}>
            Tentar novamente
          </button>
        </p>
      )}

      {listState.status === 'loaded' && listState.people.length === 0 && (
        <p className="cadastro-empty">Nenhuma pessoa cadastrada ainda.</p>
      )}

      {listState.status === 'loaded' && listState.people.length > 0 && (
        <ul className="cadastro-list">
          {listState.people.map((person) => (
            <li key={person.id} className={person.archived ? 'cadastro-item is-archived' : 'cadastro-item'}>
              <div className="cadastro-item-main">
                <span className="cadastro-item-title">
                  {person.name}
                  {person.archived && <span className="cadastro-badge">Arquivada</span>}
                </span>
                {person.phone && <span className="cadastro-item-subtitle">{person.phone}</span>}
              </div>
              <div className="cadastro-item-actions">
                <button type="button" onClick={() => openEditForm(person)} disabled={actionBusyId === person.id}>
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleArchived(person)}
                  disabled={actionBusyId === person.id}
                >
                  {person.archived ? 'Reativar' : 'Arquivar'}
                </button>
                <button
                  type="button"
                  className="destructive"
                  onClick={() => void handleDeleteClick(person)}
                  disabled={actionBusyId === person.id}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingAction && pendingAction.kind === 'delete' && (
        <ConfirmDialog
          title="Excluir pessoa"
          description={`Excluir "${pendingAction.person.name}" permanentemente? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          destructive
          busy={actionBusyId === pendingAction.person.id}
          onConfirm={() => void confirmPendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction && pendingAction.kind === 'delete-blocked' && (
        <ConfirmDialog
          title="Não é possível excluir"
          description={`"${pendingAction.person.name}" possui lançamentos vinculados e não pode ser excluída, para preservar o histórico. Deseja arquivá-la em vez disso?`}
          confirmLabel="Arquivar"
          busy={actionBusyId === pendingAction.person.id}
          onConfirm={() => void confirmPendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </section>
  );
}
