import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthenticatedUserId } from '../../lib/useAuthenticatedUserId';
import { categoryIsReferenced, createCategory, deleteCategory, listCategories, updateCategory } from '../../lib/categories';
import type { Category } from '../../lib/categories';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import './Cadastros.css';

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; categories: Category[] };

export function Categorias() {
  const userId = useAuthenticatedUserId();
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, [userId]);

  async function reload() {
    setListState({ status: 'loading' });
    try {
      const categories = await listCategories(userId);
      setListState({ status: 'loaded', categories });
    } catch {
      setListState({ status: 'error' });
    }
  }

  function openCreateForm() {
    setEditing(null);
    setName('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(category: Category) {
    setEditing(category);
    setName(category.name);
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setName('');
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Informe o nome da categoria.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (editing) {
        await updateCategory(editing.id, trimmed);
      } else {
        await createCategory(userId, trimmed);
      }
      closeForm();
      await reload();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // Decisão de produto: categoria em uso NUNCA pode ser excluída (mesmo o FK sendo
  // ON DELETE SET NULL — a aplicação impede a perda de categorização antes que o
  // banco chegue a desvincular silenciosamente).
  async function handleDeleteClick(category: Category) {
    if (actionBusyId) return;
    setActionError(null);
    setActionBusyId(category.id);
    try {
      const referenced = await categoryIsReferenced(category.id);
      if (referenced) {
        setActionError(
          `"${category.name}" está em uso em lançamentos ou cobranças fixas e não pode ser excluída. Remova-a desses registros antes de excluir a categoria.`,
        );
        return;
      }
      setPendingDelete(category);
    } catch {
      setActionError('Não foi possível verificar o uso da categoria. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setActionBusyId(pendingDelete.id);
    try {
      await deleteCategory(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch {
      setActionError('Não foi possível excluir a categoria. Tente novamente.');
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className="cadastro-page">
      <div className="cadastro-header">
        <h1>Categorias</h1>
        <button type="button" className="cadastro-primary" onClick={openCreateForm} disabled={formOpen}>
          Nova categoria
        </button>
      </div>

      {actionError && <p className="cadastro-page-error">{actionError}</p>}

      {formOpen && (
        <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
          <h2>{editing ? 'Editar categoria' : 'Nova categoria'}</h2>

          <div className="field">
            <label htmlFor="categoria-name">Nome</label>
            <input
              id="categoria-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
              autoFocus
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'categoria-form-error' : undefined}
            />
          </div>

          {formError && (
            <p id="categoria-form-error" className="error" role="alert">
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

      {listState.status === 'loading' && <p className="cadastro-loading">Carregando categorias...</p>}

      {listState.status === 'error' && (
        <p className="cadastro-page-error">
          Não foi possível carregar as categorias.{' '}
          <button type="button" onClick={() => void reload()}>
            Tentar novamente
          </button>
        </p>
      )}

      {listState.status === 'loaded' && listState.categories.length === 0 && (
        <p className="cadastro-empty">Nenhuma categoria cadastrada ainda.</p>
      )}

      {listState.status === 'loaded' && listState.categories.length > 0 && (
        <ul className="cadastro-list">
          {listState.categories.map((category) => (
            <li key={category.id} className="cadastro-item">
              <div className="cadastro-item-main">
                <span className="cadastro-item-title">{category.name}</span>
              </div>
              <div className="cadastro-item-actions">
                <button type="button" onClick={() => openEditForm(category)} disabled={actionBusyId === category.id}>
                  Editar
                </button>
                <button
                  type="button"
                  className="destructive"
                  onClick={() => void handleDeleteClick(category)}
                  disabled={actionBusyId === category.id}
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
          title="Excluir categoria"
          description={`Excluir "${pendingDelete.name}"? Esta ação não pode ser desfeita.`}
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
