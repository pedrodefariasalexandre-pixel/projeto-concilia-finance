import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Categorias } from './Categorias';
import * as categoriesLib from '../../lib/categories';

vi.mock('../../lib/useAuthenticatedUserId', () => ({
  useAuthenticatedUserId: () => 'user-1',
}));

vi.mock('../../lib/categories');

const mockedCategories = vi.mocked(categoriesLib, true);

function category(overrides: Partial<categoriesLib.Category> = {}): categoriesLib.Category {
  return {
    id: 'c1',
    user_id: 'user-1',
    name: 'Mercado',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Categorias', () => {
  it('lista categorias existentes', async () => {
    mockedCategories.listCategories.mockResolvedValue([category()]);
    render(<Categorias />);
    expect(await screen.findByText('Mercado')).toBeTruthy();
  });

  it('mostra estado vazio quando não há categorias', async () => {
    mockedCategories.listCategories.mockResolvedValue([]);
    render(<Categorias />);
    expect(await screen.findByText(/nenhuma categoria cadastrada/i)).toBeTruthy();
  });

  it('cria uma categoria nova', async () => {
    mockedCategories.listCategories.mockResolvedValue([]);
    mockedCategories.createCategory.mockResolvedValue(category());
    const user = userEvent.setup();
    render(<Categorias />);

    await screen.findByText(/nenhuma categoria cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova categoria/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Mercado');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedCategories.createCategory).toHaveBeenCalledWith('user-1', 'Mercado');
    });
  });

  it('edita uma categoria existente', async () => {
    const existing = category();
    mockedCategories.listCategories.mockResolvedValue([existing]);
    mockedCategories.updateCategory.mockResolvedValue({ ...existing, name: 'Supermercado' });
    const user = userEvent.setup();
    render(<Categorias />);

    await user.click(await screen.findByRole('button', { name: /editar/i }));
    const input = screen.getByLabelText(/^nome$/i);
    await user.clear(input);
    await user.type(input, 'Supermercado');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedCategories.updateCategory).toHaveBeenCalledWith('c1', 'Supermercado');
    });
  });

  it('exclui uma categoria sem uso diretamente', async () => {
    const existing = category();
    mockedCategories.listCategories.mockResolvedValue([existing]);
    mockedCategories.categoryIsReferenced.mockResolvedValue(false);
    mockedCategories.deleteCategory.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Categorias />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByText(/está em uso/i)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /^excluir$/i }));

    await waitFor(() => {
      expect(mockedCategories.deleteCategory).toHaveBeenCalledWith('c1');
    });
  });

  it('bloqueia a exclusão quando a categoria está em uso — nunca chama deleteCategory', async () => {
    const existing = category();
    mockedCategories.listCategories.mockResolvedValue([existing]);
    mockedCategories.categoryIsReferenced.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<Categorias />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));

    expect(await screen.findByText(/está em uso/i)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockedCategories.deleteCategory).not.toHaveBeenCalled();
  });

  it('mostra erro amigável quando o Supabase rejeita a exclusão', async () => {
    const existing = category();
    mockedCategories.listCategories.mockResolvedValue([existing]);
    mockedCategories.categoryIsReferenced.mockResolvedValue(false);
    mockedCategories.deleteCategory.mockRejectedValue(new Error('violates foreign key constraint'));
    const user = userEvent.setup();
    render(<Categorias />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^excluir$/i }));

    expect(await screen.findByText(/não foi possível excluir a categoria/i)).toBeTruthy();
    expect(screen.queryByText(/violates foreign key/i)).toBeNull();
  });
});
