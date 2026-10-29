# Correções da versão atualizada

Esta versão preserva o catálogo ampliado e as mudanças do planejador de consultas.

## Ajustes feitos
- Atualizado o teste `test_restrictive_relation_is_first` para validar o resultado compatível com o catálogo maior, sem perder a verificação da relação inicial e da equivalência dos resultados.
- Atualizado o teste `test_disconnected_graph_keeps_required_cross_product`: com 50 clientes e 3 status, o produto cartesiano correto contém 150 linhas (50 × 3), em vez de 12.
- Removidos arquivos gerados `__pycache__` e `.pyc` do pacote de entrega.

## Validação
- Comando executado: `python -m unittest discover -v`
- Resultado: 41 testes executados, todos passaram.

Observação: os testes confirmam o comportamento coberto pela suíte; uma alegação de melhoria de tempo de execução ainda exige benchmark com consultas e condições equivalentes.
