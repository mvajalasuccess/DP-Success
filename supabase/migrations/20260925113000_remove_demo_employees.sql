-- Remove os funcionários fictícios/de demonstração criados pelo sistema.
-- Funcionários reais (is_demo = false) não são afetados.
DELETE FROM public.employees WHERE is_demo = true;
