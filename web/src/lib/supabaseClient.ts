import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SavedProject {
  id: string;
  name: string;
  model_id: string;
  params: Record<string, number>;
  profile_id: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

const LOCAL_STORAGE_KEY = 'primacor_saved_projects';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('LocalStorage não acessível:', e);
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('LocalStorage falha ao gravar:', e);
  }
}

export async function getSavedProjects(): Promise<SavedProject[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('saved_projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) return data as SavedProject[];
    } catch (err) {
      console.warn('Falha ao conectar no Supabase, usando localStorage:', err);
    }
  }

  // Fallback LocalStorage seguro
  const local = safeGetItem(LOCAL_STORAGE_KEY);
  if (!local) return [];
  try {
    return JSON.parse(local);
  } catch (_) {
    return [];
  }
}

export async function saveProject(project: Omit<SavedProject, 'id' | 'created_at'>): Promise<SavedProject> {
  const newProject: SavedProject = {
    ...project,
    id: generateUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('saved_projects')
        .insert([newProject])
        .select()
        .single();
      if (!error && data) return data as SavedProject;
    } catch (err) {
      console.warn('Erro ao salvar no Supabase, salvando localmente:', err);
    }
  }

  // Fallback LocalStorage seguro
  const list = await getSavedProjects();
  list.unshift(newProject);
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  return newProject;
}

export async function deleteProject(id: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('saved_projects').delete().eq('id', id);
    } catch (err) {
      console.warn('Erro ao deletar no Supabase:', err);
    }
  }

  const list = await getSavedProjects();
  const filtered = list.filter((p) => p.id !== id);
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
}
