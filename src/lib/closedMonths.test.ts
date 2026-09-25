import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listClosedMonthFingerprints } from './closedMonths';
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

describe('listClosedMonthFingerprints', () => {
  it('mapeia linhas do banco para ClosedMonthFingerprint', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({
      data: [{ competency: '2026-06', signature: 'abc123', item_keys: ['F1|-1000|Compra'] }],
      error: null,
    });
    mockedSupabase.from.mockReturnValue(builder as never);

    const result = await listClosedMonthFingerprints('user-1');

    expect(result).toEqual([{ competency: '2026-06', signature: 'abc123', itemKeys: ['F1|-1000|Compra'] }]);
    expect(mockedSupabase.from).toHaveBeenCalledWith('closed_months');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('retorna lista vazia quando nenhum mês foi fechado ainda', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue(builder as never);

    expect(await listClosedMonthFingerprints('user-1')).toEqual([]);
  });

  it('lança erro quando a consulta falha', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockResolvedValue({ data: null, error: new Error('boom') });
    mockedSupabase.from.mockReturnValue(builder as never);

    await expect(listClosedMonthFingerprints('user-1')).rejects.toThrow('boom');
  });
});
