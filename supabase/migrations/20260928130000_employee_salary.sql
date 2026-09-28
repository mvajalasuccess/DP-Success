-- Salário atual do funcionário, editável pelo RH.
-- Mantemos o campo no cadastro para que o valor informado na tela
-- seja persistido e carregado novamente ao editar.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);

COMMENT ON COLUMN public.employees.salary IS
  'Salário atual do funcionário em reais. Valor editável pelo RH.';
