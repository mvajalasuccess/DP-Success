-- Novos perfis devem começar sempre como Consulta.
-- O Administrador poderá promover o usuário depois em Configurações.

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'consulta';

-- Garante que o papel usado pela coluna continue válido mesmo se a migration
-- for executada em uma base que já tenha a coluna criada anteriormente.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'consulta';
