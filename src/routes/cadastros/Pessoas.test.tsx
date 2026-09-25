import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Pessoas } from './Pessoas';
import * as peopleLib from '../../lib/people';

vi.mock('../../lib/useAuthenticatedUserId', () => ({
  useAuthenticatedUserId: () => 'user-1',
}));

vi.mock('../../lib/people');

const mockedPeople = vi.mocked(peopleLib, true);

function person(overrides: Partial<peopleLib.Person> = {}): peopleLib.Person {
  return {
    id: 'p1',
    user_id: 'user-1',
    name: 'Nega',
    phone: null,
    color: null,
    archived: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Pessoas', () => {
  it('lista pessoas existentes', async () => {
    mockedPeople.listPeople.mockResolvedValue([person()]);
    render(<Pessoas />);
    expect(await screen.findByText('Nega')).toBeTruthy();
  });

  it('mostra estado vazio quando não há pessoas', async () => {
    mockedPeople.listPeople.mockResolvedValue([]);
    render(<Pessoas />);
    expect(await screen.findByText(/nenhuma pessoa cadastrada/i)).toBeTruthy();
  });

  it('cria uma pessoa nova com user_id do contexto autenticado', async () => {
    mockedPeople.listPeople.mockResolvedValue([]);
    mockedPeople.createPerson.mockResolvedValue(person());
    const user = userEvent.setup();
    render(<Pessoas />);

    await screen.findByText(/nenhuma pessoa cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova pessoa/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Nega');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedPeople.createPerson).toHaveBeenCalledWith('user-1', {
        name: 'Nega',
        phone: null,
        color: null,
      });
    });
  });

  it('bloqueia envio com nome vazio', async () => {
    mockedPeople.listPeople.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Pessoas />);

    await screen.findByText(/nenhuma pessoa cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova pessoa/i }));
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedPeople.createPerson).not.toHaveBeenCalled();
  });

  it('impede duplo submit ao criar', async () => {
    mockedPeople.listPeople.mockResolvedValue([]);
    let resolveCreate: (value: peopleLib.Person) => void = () => {};
    mockedPeople.createPerson.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const user = userEvent.setup();
    render(<Pessoas />);

    await screen.findByText(/nenhuma pessoa cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova pessoa/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Nega');

    const submit = screen.getByRole('button', { name: /^salvar$/i });
    await user.click(submit);
    await user.click(submit);

    expect(mockedPeople.createPerson).toHaveBeenCalledTimes(1);
    resolveCreate(person());
  });

  it('edita uma pessoa existente', async () => {
    const existing = person();
    mockedPeople.listPeople.mockResolvedValue([existing]);
    mockedPeople.updatePerson.mockResolvedValue({ ...existing, name: 'Nega Editada' });
    const user = userEvent.setup();
    render(<Pessoas />);

    await user.click(await screen.findByRole('button', { name: /editar/i }));
    const nameInput = screen.getByLabelText(/^nome$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Nega Editada');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedPeople.updatePerson).toHaveBeenCalledWith('p1', {
        name: 'Nega Editada',
        phone: null,
        color: null,
      });
    });
  });

  it('arquiva uma pessoa a partir da lista', async () => {
    const existing = person();
    mockedPeople.listPeople.mockResolvedValue([existing]);
    mockedPeople.setPersonArchived.mockResolvedValue({ ...existing, archived: true });
    const user = userEvent.setup();
    render(<Pessoas />);

    await user.click(await screen.findByRole('button', { name: /^arquivar$/i }));

    expect(mockedPeople.setPersonArchived).toHaveBeenCalledWith('p1', true);
  });

  it('pessoa SEM nenhuma referência: exclui de verdade', async () => {
    const existing = person();
    mockedPeople.listPeople.mockResolvedValue([existing]);
    mockedPeople.personIsReferenced.mockResolvedValue(false);
    mockedPeople.deletePerson.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Pessoas />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^excluir$/i }));

    await waitFor(() => {
      expect(mockedPeople.deletePerson).toHaveBeenCalledWith('p1');
    });
    expect(mockedPeople.setPersonArchived).not.toHaveBeenCalled();
  });

  it('pessoa COM alguma referência (transaction_people, fixed_charges ou memory_rules): não chama delete, arquiva em vez disso', async () => {
    const existing = person();
    mockedPeople.listPeople.mockResolvedValue([existing]);
    mockedPeople.personIsReferenced.mockResolvedValue(true);
    mockedPeople.setPersonArchived.mockResolvedValue({ ...existing, archived: true });
    const user = userEvent.setup();
    render(<Pessoas />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/não pode ser excluída/i)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: /arquivar/i }));

    await waitFor(() => {
      expect(mockedPeople.setPersonArchived).toHaveBeenCalledWith('p1', true);
    });
    expect(mockedPeople.deletePerson).not.toHaveBeenCalled();
  });

  it('pessoa arquivada continua visível e representável na listagem', async () => {
    mockedPeople.listPeople.mockResolvedValue([person({ archived: true })]);
    render(<Pessoas />);

    expect(await screen.findByText('Nega')).toBeTruthy();
    expect(screen.getByText(/arquivada/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^reativar$/i })).toBeTruthy();
  });
});
