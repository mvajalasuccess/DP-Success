# DP Success — roadmap de estabilização

## Concluído / confirmado no código-fonte
- Backend Lovable Cloud, autenticação e módulos principais do DP/ RH.
- Configurações: o código implementa cadastro/exclusão de feriados e gestão de acesso de usuários. A validação ponta a ponta ainda depende de testar a prévia publicada.
- Atestados: o código atual contém edição e exclusão.
- Declarações: o código atual contém edição e exclusão.
- Faltas/Ocorrências: o código atual contém edição e exclusão.
- Jornadas/Escalas: o código atual contém exclusão com bloqueio quando há funcionários vinculados.
- KPIs, Comparativos, Relatórios e Parâmetros: a versão revisada não contém referências às tabelas antigas citadas abaixo; as telas consultam as tabelas atuais do projeto. Isso é uma revisão estática do código, não uma confirmação de que todas as consultas funcionam em runtime.

## Em aberto
- [ ] Validar na prévia os fluxos de Indicadores/KPIs, Relatórios, Comparativos e Parâmetros com dados reais e erros de consulta visíveis. Antes de refatorar, mapear cada cálculo e sua origem atual.
- [ ] Auditar a camada central `src/lib/dp-model.ts` contra KPIs, Comparativos e Dashboard sem alterar fórmulas, saldos históricos, fechamentos ou registros.
- [ ] Testar na prévia edição/exclusão de Atestados, Declarações e Ocorrências, e exclusão de Jornadas. Não excluir registros de produção durante o teste.
- [ ] Confirmar que o Dashboard escolhe a competência pela data real do período (`end_date`, com `start_date` como desempate), não pela ordenação de ano/mês.
- [ ] Testar na prévia as telas de Lançamentos e Banco de Horas.
- [ ] Corrigir os avisos de segurança somente depois de obter o detalhe de cada achado e confirmar o impacto. Não alterar políticas/permissões de forma ampla.
- [ ] Testar autorização de agentes/MCP após publicar o app, conforme a dependência do Lovable.

## Restrições para qualquer manutenção
- Preservar a lógica de cálculo atualmente validada, inclusive regras históricas e ajustes manuais existentes.
- Não executar recálculos em massa, migrações ou alterações em dados de produção como parte de uma correção de interface.
- Não usar dados fictícios para mascarar consultas vazias ou erros de esquema.
- Build/lint e testes de runtime só devem ser marcados como concluídos depois de executados e verificados.
- A branch de código não substitui um backup recuperável do banco de dados.
