import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMemoryRules } from './memoryRules';
import { supabase } from './supabaseClient';

function createQueryBuilder() {
  const builder = { select: vi.fn(), eq: vi.fn() };
  builder.select.mockReturnValue(builder);
  return builder;
}

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

const mockedSupabase = vi.mocked(supabase, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listMemoryRules', () => {
  it('mapeia linhas do banco (snake_case) para o tipo de domínio MemoryRule', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({
      data: [
        {
          id: 'r1',
          rule_key: 'NETFLIX|3990',
          sample_description: 'Netflix.com',
          amount_cents: 3990,
          category_id: 'cat1',
          person_ids: ['p1'],
        },
      ],
      error: null,
    });
    mockedSupabase.from.mockReturnValue(builder as never);

    const rules = await listMemoryRules('user-1');

    expect(rules).toEqual([
      {
        id: 'r1',
        key: 'NETFLIX|3990',
        sampleDescription: 'Netflix.com',
        amountCents: 3990,
        personIds: ['p1'],
        categoryId: 'cat1',
      },
    ]);
    expect(mockedSupabase.from).toHaveBeenCalledWith('memory_rules');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('retorna lista vazia quando não há regras', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue(builder as never);

    expect(await listMemoryRules('user-1')).toEqual([]);
  });

  it('lança erro quando a consulta falha', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({ data: null, error: new Error('boom') });
    mockedSupabase.from.mockReturnValue(builder as never);

    await expect(listMemoryRules('user-1')).rejects.toThrow('boom');
  });
});
