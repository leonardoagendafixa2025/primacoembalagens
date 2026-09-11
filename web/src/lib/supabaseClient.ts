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

  // Fallback LocalStorage
  const local = localStorage.getItem(LOCAL_STORAGE_KEY);
  return local ? JSON.parse(local) : [];
}

export async function saveProject(project: Omit<SavedProject, 'id' | 'created_at'>): Promise<SavedProject> {
  const newProject: SavedProject = {
    ...project,
    id: crypto.randomUUID(),
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

  // Fallback LocalStorage
  const list = await getSavedProjects();
  list.unshift(newProject);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
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
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
}
