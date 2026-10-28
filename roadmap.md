# DP Success — roadmap

## Solicitação atual
- [x] Corrigir identificação por conta autenticada e preservar nomes e permissões; testes automatizados Mariana/Carlos e verificação da conta própria após atualizar e sair.
- [ ] Validar entrada e reentrada com duas contas reais nomeadas: depende de acesso autorizado à segunda conta; não criar usuários fictícios nem alterar nomes existentes.

## Concluído
- Backend (Lovable Cloud) ativo e saudável; autenticação, setores, cargos, jornadas, funcionários, ponto, ocorrências, atestados, banco de horas, fechamento, competências e lançamentos.
- Configurações: feriados com adicionar/remover, usuários com perfil, ativação e exclusão de acesso.
- Compilação e build sem erros.

## Em aberto
- [ ] KPIs, Relatórios, Comparativos e Parâmetros ainda leem tabelas que não existem no banco (`competencies`, `point_launches`, `bank_movements`, `calculation_parameters`) e usam conversões forçadas. Reescrever sobre a camada central de cálculos (`src/lib/dp-model.ts`).
- [ ] Atestados e Ocorrências: formulários com campos que não batem com o banco; sem edição e sem exclusão.
- [ ] Jornadas/Escalas: falta opção de excluir.
- [ ] Painel inicial: escolher a competência pela data real do período (`start_date`/`end_date`) em vez de ano/mês.
- [ ] Testar na prévia as telas de Lançamentos e Banco de Horas (nunca foram clicadas).
- [ ] Confirmar a versão ajustada do menu suspenso no `package.json`.
- [ ] Corrigir os avisos de segurança do banco (perfis das funções de cálculo).

## Bloqueios
- 2 achados de segurança do verificador permanecem ativos fora da seleção pedida; o usuário precisa escolher quais corrigir.
- A tela de autorização de agentes (MCP) só funciona com o app publicado.
