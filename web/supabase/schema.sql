-- ==============================================================================
-- Schema do Supabase para PRIMACOR CAD Web (Embalagens Paramétricas)
-- Execute este script no "SQL Editor" do painel do seu projeto no Supabase
-- ==============================================================================

-- 1. Habilitar extensão UUID caso não esteja ativa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Perfis de Papelão e Qualidades
CREATE TABLE IF NOT EXISTS cardboard_profiles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL,
  thickness NUMERIC(5,2) NOT NULL, -- em mm
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserção de perfis padrão
INSERT INTO cardboard_profiles (id, name, code, thickness, description)
VALUES 
  ('cartao_300', 'Papel Cartão Duplex/Triplex', 'CARTAO', 0.5, '300-350g/m² - Caixas leves, remédios e cosméticos'),
  ('onda_f', 'Micro-ondulado Onda F', 'F', 0.9, 'Micro-ondulado fino para acabamento nobre'),
  ('onda_e', 'Micro-ondulado Onda E', 'E', 1.5, 'Excelente para caixas de e-commerce e alimentos'),
  ('onda_b', 'Papelão Ondulado Onda B', 'B', 3.0, 'Padrão industrial rígido para transporte médio'),
  ('onda_c', 'Papelão Ondulado Onda C', 'C', 4.0, 'Alta resistência ao empilhamento'),
  ('onda_bc', 'Onda Dupla (Onda BC)', 'BC', 7.0, 'Pesado para cargas industriais e exportação')
ON CONFLICT (id) DO NOTHING;

-- 3. Tabela de Projetos e Facas Salvas pelos Usuários
CREATE TABLE IF NOT EXISTS saved_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  model_id VARCHAR(50) NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id VARCHAR(50) REFERENCES cardboard_profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_saved_projects_model ON saved_projects(model_id);
CREATE INDEX IF NOT EXISTS idx_saved_projects_created ON saved_projects(created_at DESC);

-- 4. Políticas de Acesso (Row Level Security - RLS)
-- Por padrão, permite leitura e escrita anônima para demonstração
ALTER TABLE cardboard_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura publica de perfis" 
  ON cardboard_profiles FOR SELECT USING (true);

CREATE POLICY "Permitir leitura publica de projetos" 
  ON saved_projects FOR SELECT USING (true);

CREATE POLICY "Permitir criacao de projetos" 
  ON saved_projects FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualizacao de projetos" 
  ON saved_projects FOR UPDATE USING (true);

CREATE POLICY "Permitir delecao de projetos" 
  ON saved_projects FOR DELETE USING (true);
