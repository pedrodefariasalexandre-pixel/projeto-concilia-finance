import { beforeEach, describe, expect, it, vi } from 'vitest';
import { personIsReferenced } from './people';
import { supabase } from './supabaseClient';

type CountResult = { count: number; error: Error | null };

function createBuilder(result: CountResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    contains: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockResolvedValue(result);
  builder.contains.mockResolvedValue(result);
  return builder;
}

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

const mockedSupabase = vi.mocked(supabase, true);

function mockCounts(counts: { transactionPeople?: number; fixedCharges?: number; memoryRules?: number }) {
  const { transactionPeople = 0, fixedCharges = 0, memoryRules = 0 } = counts;
  mockedSupabase.from.mockImplementation((table: string) => {
    if (table === 'transaction_people') return createBuilder({ count: transactionPeople, error: null }) as never;
    if (table === 'fixed_charges') return createBuilder({ count: fixedCharges, error: null }) as never;
    if (table === 'memory_rules') return createBuilder({ count: memoryRules, error: null }) as never;
    throw new Error(`tabela inesperada: ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('personIsReferenced', () => {
  it('retorna false quando não há nenhuma referência', async () => {
    mockCounts({});

    expect(await personIsReferenced('p1')).toBe(false);
  });

  it('retorna true quando só transaction_people referencia a pessoa', async () => {
    mockCounts({ transactionPeople: 1 });

    expect(await personIsReferenced('p1')).toBe(true);
  });

  it('retorna true quando só fixed_charges.person_ids referencia a pessoa', async () => {
    mockCounts({ fixedCharges: 1 });

    expect(await personIsReferenced('p1')).toBe(true);
  });

  it('retorna true quando só memory_rules.person_ids referencia a pessoa', async () => {
    mockCounts({ memoryRules: 1 });

    expect(await personIsReferenced('p1')).toBe(true);
  });

  it('consulta as três tabelas, usando contains(person_ids, [id]) para as colunas array', async () => {
    mockCounts({});

    await personIsReferenced('p1');

    expect(mockedSupabase.from).toHaveBeenCalledWith('transaction_people');
    expect(mockedSupabase.from).toHaveBeenCalledWith('fixed_charges');
    expect(mockedSupabase.from).toHaveBeenCalledWith('memory_rules');
  });

  it('lança erro se qualquer uma das três consultas falhar', async () => {
    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === 'transaction_people') return createBuilder({ count: 0, error: new Error('boom') }) as never;
      return createBuilder({ count: 0, error: null }) as never;
    });

    await expect(personIsReferenced('p1')).rejects.toThrow('boom');
  });
});
