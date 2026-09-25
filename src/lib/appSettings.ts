import { supabase } from './supabaseClient';

export type AppSettings = {
  user_id: string;
  inactivity_minutes: number;
};

const DEFAULT_INACTIVITY_MINUTES = 5;
const SETTINGS_COLUMNS = 'user_id, inactivity_minutes';

export async function getAppSettings(userId: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  return {
    user_id: userId,
    inactivity_minutes: DEFAULT_INACTIVITY_MINUTES,
  };
}
