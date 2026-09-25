import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppSettings } from './appSettings';
import { supabase } from './supabaseClient';

function createQueryBuilder() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockedSupabase = vi.mocked(supabase, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAppSettings', () => {
  it('retorna valores padrão quando ainda não existe registro', async () => {
    const builder = createQueryBuilder();
    builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue(builder as never);

    const settings = await getAppSettings('user-1');

    expect(settings).toEqual({ user_id: 'user-1', inactivity_minutes: 5 });
    expect(mockedSupabase.from).toHaveBeenCalledWith('app_settings');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('retorna o registro existente', async () => {
    const builder = createQueryBuilder();
    builder.maybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', inactivity_minutes: 10 },
      error: null,
    });
    mockedSupabase.from.mockReturnValue(builder as never);

    const settings = await getAppSettings('user-1');

    expect(settings.inactivity_minutes).toBe(10);
  });

  it('lança erro quando a consulta falha', async () => {
    const builder = createQueryBuilder();
    builder.maybeSingle.mockResolvedValue({ data: null, error: new Error('boom') });
    mockedSupabase.from.mockReturnValue(builder as never);

    await expect(getAppSettings('user-1')).rejects.toThrow('boom');
  });
});
