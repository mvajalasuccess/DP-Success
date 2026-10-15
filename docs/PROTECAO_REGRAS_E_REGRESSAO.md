# Proteção das regras de negócio — DP Success

**Status:** documentação inicial de proteção. Este arquivo não altera a aplicação, os cálculos ou os dados.

## Regra de segurança principal

Os cálculos e fechamentos históricos do DP Success já passaram por correções depois de diferenças que afetaram pagamentos de horas extras. Portanto:

- Não alterar fórmulas, critérios de inclusão, arredondamentos, saldos ou competências sem autorização explícita e validação comparativa.
- Não executar recálculos em massa, migrações destrutivas, correções SQL de dados ou reprocessamentos de lançamentos como parte de melhorias visuais/técnicas.
- Não considerar a branch de código um backup do banco de dados.
- Fazer novas melhorias primeiro em branch separada e revisar o diff antes de integrar.
- Preservar os valores atualmente registrados como referência; não “corrigir” resultados históricos apenas porque parecem diferentes de uma fórmula teórica.

## Regras relatadas pela responsável pelo sistema

Estas regras foram registradas a partir das orientações da responsável. Antes de qualquer mudança funcional, conferir o comportamento atual do código e os exemplos validados no sistema. Este documento não certifica, sozinho, que cada regra esteja implementada corretamente.

### Competência e quadro de funcionários

- A competência padrão vai do dia 21 de um mês ao dia 20 do mês seguinte.
- O quadro de funcionários deve respeitar datas de admissão e desligamento na competência selecionada.
- Funcionários desligados não devem aparecer como ativos em competências posteriores ao desligamento; telas como Banco de Horas e Lançamentos podem precisar permitir consulta de inativos/históricos.
- A exibição especial da competência de janeiro (11/12/2025 a 20/01/2026) é uma regra de apresentação relatada, sem autorização para mudar cálculos.

### Lançamentos, banco de horas e horas extras

- O saldo mensal de lançamentos segue a regra validada pela responsável: créditos menos débitos.
- O primeiro movimento é Crédito e o segundo é Débito, conforme o fluxo já utilizado.
- Interjornada pode ser exibida, mas não deve compor o saldo de banco de horas.
- A categoria de HE “60%20%” pode ser exibida em cartões/indicadores específicos, mas não deve entrar no total de horas extras definido pela responsável.
- Edições e exclusões precisam manter consistência entre Lançamentos, Banco de Horas e Fechamento de Ponto, sem recalcular outros períodos indevidamente.
- Saldos manuais/históricos informados e validados devem ser preservados.

### Absenteísmo

- A fórmula atualmente informada pela responsável é: (débitos + faltas + abonos) ÷ horas previstas × 100.
- Declarações e atestados não devem ser somados novamente ao absenteísmo quando já estiverem representados como abonos, para evitar dupla contagem.
- Horas previstas devem respeitar a competência, jornada, calendário/feriados e as regras já validadas.

### Importação de cartão-ponto e planilhas

- A importação deve focar em Crédito, Débito, Saldo do mês, Adicional Noturno e Interjornada.
- A prévia deve ser conferida antes de gravar dados.
- Não inventar correspondências entre funcionário, linha da planilha ou competência.
- Atualizar/gerar planilha não deve sobrescrever dados não selecionados nem criar lançamentos duplicados.
- A prévia deve permitir identificar as novas linhas e a competência correspondente antes da confirmação.

## Testes de regressão obrigatórios antes de alterações que toquem regras ou telas relacionadas

Registrar os resultados atuais (capturas de tela e, quando disponível, exportação) antes da mudança. Após a mudança, repetir os mesmos passos e comparar os valores. Não usar apenas “a tela abriu” como critério de aprovação.

1. **Competências:** conferir limites 21–20, virada de mês/ano e a exibição especial de janeiro.
2. **Funcionários por competência:** conferir admissões, desligamentos e filtros Ativos/Inativos/Todos; verificar que o histórico continua consultável.
3. **Lançamentos:** conferir um exemplo conhecido de crédito, débito e saldo mensal; editar e excluir e verificar as telas relacionadas.
4. **Banco de Horas:** conferir saldos anteriores e atuais, incluindo valores negativos e manuais; garantir que períodos não relacionados não mudem.
5. **Horas extras:** comparar totais e distribuição por tipo; garantir que Interjornada e 60%20% sejam tratados conforme as regras acima.
6. **Absenteísmo:** comparar numerador, horas previstas e percentual em competências já validadas; garantir que declaração/atestado não gere dupla contagem de abono.
7. **Importação:** validar prévia, funcionário, competência, campos permitidos, duplicidade e resultado depois de gravar; testar a planilha atualizada sem sobrescrever valores indevidos.
8. **Dashboard/KPIs/relatórios:** comparar contagens, totais e percentuais com a referência capturada antes da mudança.
9. **Persistência:** recarregar a aplicação e confirmar que os dados continuam iguais.
10. **Build e erros de interface:** verificar compilação e fluxos principais; um build bem-sucedido não substitui a comparação dos valores.

### Critério de aprovação

- Nenhum valor de referência muda sem explicação e aprovação explícita.
- Nenhuma alteração de código executa recálculo ou alteração em massa de dados.
- Se houver diferença inesperada, interromper a integração e investigar; não ajustar o dado para “fazer bater”.
- Registrar o que foi testado, o resultado esperado, o resultado observado e eventuais diferenças.

## Plano de proteção do banco de dados

A branch Git protege somente o código versionado. Ela não copia nem restaura registros do Supabase.

Antes de alterações que afetem persistência ou estrutura de dados:

1. Identificar um procedimento autorizado de backup/exportação do banco e confirmar que ele pode ser restaurado.
2. Guardar a exportação em local seguro e com acesso restrito, pois contém dados de funcionários.
3. Preferir uma restauração/teste em ambiente separado, sem tocar nos dados de produção.
4. Não executar migrações, comandos SQL ou reprocessamentos até existir um plano de recuperação confirmado.
5. Registrar data, responsável, escopo do backup e como verificar a restauração.

**Limitação atual:** esta documentação não executou nem confirmou um backup do Supabase. A responsável informou que não acessa diretamente a interface do Supabase e trabalha pelo Lovable; o método autorizado de backup precisa ser identificado no fluxo disponível para ela.

## Próxima etapa segura

Com esta documentação registrada em uma branch isolada, revisar o código de leitura/escrita e montar casos de teste com valores de referência reais antes de implementar rastreabilidade de alterações. A auditoria deve ser aditiva e não pode modificar cálculos, saldos ou registros existentes.


## Situação inicial dos testes automatizados

Na revisão inicial do `package.json` da branch `main`, os scripts disponíveis incluem `build` e `lint`, mas não há script dedicado de testes automatizados (por exemplo, `test`, Vitest ou Jest) declarado no arquivo consultado.

Isso não prova que não existam verificações manuais ou outras validações; apenas registra que não foi identificado um comando de testes automatizados no `package.json`. Não foi executado build, lint ou teste funcional nesta etapa.

Antes de introduzir testes automatizados, mapear funções de cálculo e fixtures de referência sem alterar a lógica de produção. Os testes devem começar como verificações de leitura/comparação e não devem escrever no banco real.
