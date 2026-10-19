-- Restringe a autoatualização de profiles a campos de identificação.
-- Mantém a edição do próprio nome/e-mail, sem permitir alterações em id ou timestamps
-- por chamadas diretas à API. Não altera dados existentes nem regras de cálculo.

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, email) ON TABLE public.profiles TO authenticated;
