# Plano seguro de melhorias — DP SUCCESS

## Regra inegociável: preservar resultados históricos

- Não alterar fórmulas de cálculo, critérios de seleção de registros, saldos, horas extras, competências ou resultados históricos já validados.
- Não executar recálculo em massa nem migrações de banco nesta etapa.
- Não modificar dados de produção para “corrigir” diferenças sem autorização explícita e evidência da origem.
- Qualquer nova regra de negócio exige aprovação explícita e data de início; nunca deve reescrever competências anteriores.
- Correções pontuais previamente validadas devem permanecer intactas.

## Ordem de trabalho

1. **Ponto seguro e isolamento:** manter melhorias em branch separada; revisar o diff antes de qualquer integração.
2. **Segurança sem mudança de permissões às cegas:** mapear autenticação, autorização por perfil e políticas RLS; investigar os alertas existentes antes de alterar políticas.
3. **Regressão e integridade:** identificar as fontes de dados e os resultados de referência; adicionar testes que confirmem que as funções de cálculo existentes continuam produzindo os mesmos resultados.
4. **Auditoria/rastreabilidade:** planejar histórico de alterações em lançamentos (autor, data/hora, valor anterior e novo valor) sem substituir nem recalcular os registros atuais.
5. **Importações seguras:** avaliar prévia, validação, duplicidades e confirmação antes de persistir; não mudar a regra de correspondência nem importar dados automaticamente.
6. **Desempenho e usabilidade:** otimizar consultas, filtros e navegação sem alterar a população de registros nem o significado dos indicadores.

## Critérios obrigatórios antes de integrar

- Build e lint executados quando o ambiente permitir.
- Diff revisado e limitado ao escopo aprovado.
- Nenhuma migration, alteração de política/permissão ou atualização de dados sem revisão específica.
- Comparação de resultados antes/depois em casos de referência, incluindo competências históricas.
- Preview do Lovable conferido antes de considerar a melhoria validada.

## Registro de execução

- Branch de trabalho: `melhorias/estabilidade-auditoria-2026-10`
- Estado inicial: documentação e investigação; nenhuma fórmula, dado de produção, tabela ou política de acesso foi alterada por este plano.

## Alertas de segurança identificados para revisão

1. **Atualização do próprio perfil (profiles):** alerta anterior indicou que uma política pode permitir autoatualização de campos sensíveis, incluindo role e active. É necessário localizar a política efetivamente aplicada e confirmar quais colunas o usuário pode alterar antes de propor uma correção. Não alterar a política sem essa confirmação.
2. **Edge Function delete-user:** supabase/config.toml declara verify_jwt = false. O código de supabase/functions/delete-user/index.ts valida o token com auth.getUser(token) e exige perfil ativo com papel administrador ou rh antes de excluir usuário. Não mudar a configuração isoladamente sem testar o fluxo real de chamada/autenticação; o comportamento deve ser revisto como conjunto.

### Limitação da investigação atual

O código da função de exclusão foi lido, mas não foi possível confirmar via acesso ao repositório qual política SQL de profiles está implantada no projeto conectado nem inspecionar o estado real das políticas RLS. Portanto, nenhum ajuste de permissões foi aplicado. A correção deve partir da migration/política implantada, não de suposição.

## Resultado da primeira validação automática

- Build de produção: **aprovado** no primeiro workflow executado.
- Lint global: **reprovado por dívida preexistente** — a execução reportou 3.461 erros e 14 avisos de estilo/formatação em diversos arquivos do projeto, incluindo arquivos que não foram alterados nesta branch.
- Para não deixar toda futura integração bloqueada por esse problema amplo e fora do escopo inicial, o workflow foi ajustado para validar o build de produção. A dívida de lint permanece registrada para correção incremental, sem aplicar formatação em massa nem modificar cálculos.
