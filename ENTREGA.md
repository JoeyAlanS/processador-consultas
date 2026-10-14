# Guia da entrega 3 — 22/10/2026

Branch: `entrega-3`. Esta é uma versão cumulativa organizada conforme o cronograma fornecido. O prazo identifica a entrega acadêmica; o Git registra a data real dos commits. A base já continha o projeto completo, por isso a primeira branch recorta a etapa inicial e as seguintes acrescentam os recursos em sequência.

## O que está pronto

Acrescenta antecipação de seleção e projeção. O grafo otimizado filtra cada tabela antes das combinações e conserva apenas os campos necessários depois dos filtros. A ordem das relações, a ordem textual dos filtros e os produtos cartesianos do SQL continuam preservados. Executa os dois planos em memória para verificar as transformações.

| Prazo | Requisito | Situação nesta branch |
| --- | --- | --- |
| 15/10/2026 | Interface gráfica existente e funcional | Disponível |
| 15/10/2026 | A string é parseada | Disponível |
| 15/10/2026 | Campos e comandos errados são validados | Disponível |
| 20/10/2026 | Conversão para álgebra relacional | Disponível |
| 20/10/2026 | Grafo não otimizado | Disponível |
| 22/10/2026 | Heurísticas de projeção e seleção | Disponível |
| 27/10/2026 | Demais heurísticas | Etapa futura |

## Como a entrada é processada

1. `app.js` envia a string do editor para `POST /api/process`. O JavaScript controla formulários, abas, desenho e exportação.
2. `server.py` verifica o JSON e o campo `sql`, chama `consulta.process_query` e devolve uma resposta JSON. `create_server` também permite testes HTTP numa porta temporária.
3. `tokenize`, em `consulta/parser.py`, reconhece palavras, campos qualificados, números, textos, símbolos e operadores, guardando a posição de cada token. A classe `QueryError` transporta a mensagem e a posição para a interface.
4. `Parser` percorre os tokens na gramática `SELECT … FROM … [INNER JOIN … ON …] [WHERE …]`. Condições com `AND` e parênteses viram uma árvore de expressões.
5. `parse` devolve a AST: `columns`, `tables`, `joins`, `where` e `tokens`. `validate` consulta o esquema e resolve cada campo para `alias.Campo`; rejeita tabelas inexistentes, campos inválidos ou ambíguos, aliases repetidos e referências fora do escopo do `ON`.
6. `comparisons` decompõe as conjunções; `predicate_text` gera rótulos legíveis. `processor.py` reúne a resposta desta etapa.

`consulta/schema.py` lê `data/catalog.json`. O esquema contém as dez tabelas do enunciado; os registros de exemplo permitem uma demonstração reproduzível. `*` é expandido usando os campos do catálogo e a ordem do `SELECT` é preservada.

Consultas inválidas mostram linha e coluna. O servidor converte a posição Python para UTF-16, que é o índice usado pela seleção do editor no navegador. A entrada tem limite de 20.000 caracteres e 100 níveis de parênteses.

## Grafo original e álgebra

`build_plan`, em `consulta/planner.py`, cria nós `scan` (leitura), `join` (junção), `cross` (produto cartesiano), `select` (seleção) e `project` (projeção). Cada nó tem identificador, filhos, campos e estimativa de tuplas.

O plano original lê as tabelas na ordem do SQL. `INNER JOIN … ON` vira `⋈`; tabelas separadas por vírgula produzem `×`. O `WHERE` é aplicado após combinar as relações, e uma projeção final `π` mantém a ordem dos campos pedidos.

`execution_order` faz um percurso iterativo em pós-ordem: filhos antes do pai. `relational_algebra` usa essa ordem para escrever a expressão com `σ`, `π`, `⋈`, `×` e renomeação `ρ`. Os rótulos, símbolos e números dos nós já chegam prontos do Python. `graphSvg`, no JavaScript, apenas calcula posições visuais e desenha o SVG.

Exemplo com uma tabela: `SELECT Nome FROM Produto WHERE Preco > 200` produz `π[Produto.Nome](σ[Produto.Preco > 200](Produto))` no plano original.

As estimativas usam o tamanho da amostra e fatores didáticos: igualdade 0,10; `<>` 0,90; comparações de faixa 0,33. Estimar uma cardinalidade não altera a ordem do plano original e não equivale a uma contagem real.

## Seleção e projeção antecipadas

O otimizador separa predicados que referenciam uma tabela dos que relacionam duas ou mais. Predicados locais são aplicados logo após a leitura da tabela. Isso também vale para predicados locais do `ON`, pois as junções suportadas são internas.

Depois dos filtros locais, uma projeção conserva os campos do `SELECT` e todos os atributos ainda necessários para comparar tabelas. Um campo usado apenas num filtro local pode ser descartado depois do filtro. A projeção final reaplica a lista do `SELECT` na ordem correta.

Por exemplo, em `SELECT p.Nome FROM Produto p, Categoria c WHERE p.Categoria_idCategoria = c.idCategoria AND p.Preco > 200`, a seleção de preço desce até Produto. A projeção local de Produto conserva `p.Nome` e `p.Categoria_idCategoria`; a de Categoria conserva `c.idCategoria`. A chave não pode ser removida antes de testar a condição entre as tabelas.

As projeções preservam duplicatas, como SELECT sem DISTINCT. Mesmo uma projeção sem atributos mantém uma tupla vazia para cada linha de entrada, conservando a multiplicidade necessária em produtos cartesianos.

## Execução e comparação

`execute`, em `consulta/executor.py`, percorre os operadores em pós-ordem, qualifica os campos das leituras, aplica predicados, projeta colunas e combina pares em junções ou produtos. Retorna linhas, colunas e `trace` com entradas, saídas e largura de cada operador. Resultados intermediários dos filhos são liberados após o uso.

`evaluate` aplica as comparações: números inteiros e decimais pertencem ao mesmo tipo; comparar texto com número gera erro; comparações com NULL não passam pelo filtro. Os dados de demonstração são executados em memória.

`equivalent` compara as colunas e um contador de tuplas. A ordem das linhas pode mudar, mas a quantidade de cada tupla deve permanecer igual. `processor.py` executa os planos original e otimizado e marca `verified` quando os resultados são equivalentes. Falha do plano original por limite de recursos não descarta uma execução otimizada válida; nesse caso informa que a equivalência não foi verificada.

Cada plano tem limites de 50.000 tuplas intermediárias e 500.000 unidades de trabalho. Trabalho conta visitas a linhas e pares testados. Células materializadas somam tuplas × atributos de cada operador, inclusive a saída; não representam tempo de execução. A otimização não promete reduzir o custo de toda consulta.

## Mudanças em relação à entrega 2

- `build_plan(..., optimized=True)` acrescenta somente seleção e projeção antecipadas.
- Os filtros locais mantêm sua ordem textual, sem ordenação por seletividade.
- As tabelas continuam na ordem do SQL. Predicados entre tabelas no WHERE continuam acima das combinações, mantendo `×` nesta etapa.
- Introduz `consulta/executor.py`, a comparação dos resultados, métricas, abas de execução/resultados e exportação CSV como apoio à validação das transformações.
- Os testes incluem resultados conhecidos, chaves preservadas, duplicatas, tuplas vazias, limites, NULL, tipos e 100 consultas comparadas com uma referência independente.

## O que entra apenas na entrega 4

Ordenar filtros por restrição estimada, reordenar relações e converter produtos cartesianos com predicados entre tabelas em junções. Para demonstrar a diferença, use os exemplos Junção no WHERE e Pedidos por cliente nas duas branches.

## Roteiro de apresentação

1. Carregue **Produtos e categorias** e use **Comparar** no grafo.
2. Observe `σ` e `π` próximos às leituras: os filtros precedem a projeção local e os campos de junção permanecem.
3. Abra **Plano de execução** e **Resultados** para conferir tuplas, atributos e equivalência.
4. Carregue **Junção no WHERE**: o plano otimizado ainda conserva `×`; sua conversão entra na entrega 4.
5. Em **Pedidos por cliente**, confira que a ordem das tabelas segue o SQL.

## Validação

Foram executados **40 testes** com `python -B -m unittest discover -s tests -v`. A suite verifica entradas válidas e inválidas, catálogo, aliases, ambiguidade, limites do parser, posições de erro e integração HTTP. A partir da entrega 2 verifica também os operadores e sua ordem; a partir da entrega 3 verifica resultados e equivalência.

`node --check app.js` verifica a sintaxe da apresentação, sem tornar Node.js uma dependência da aplicação. `git diff --check` verifica o patch. O README contém os comandos para executar a branch, a API e a matriz de requisitos disponíveis e futuros.

Os documentos foram usados como referência dos requisitos acadêmicos e dos prazos. A organização das branches, commits e publicação foi solicitada pelo usuário. A apresentação ou submissão à disciplina permanece responsabilidade da equipe.

## Revisão do repositório — 14/10/2026

A branch foi renomeada para `entrega-3`, mantendo todos os commits da versão anterior. A revisão corrigiu precisão de inteiros no parser, rejeição de Unicode inválido com erro de consulta, apresentação dos literais numéricos e exportação JSON sem reconversão dos números pelo navegador. Foram removidos auxiliares de apresentação redundantes e, quando presentes, código sem uso. Nenhum recurso de uma entrega futura foi antecipado.

Os documentos detalhados da revisão completa e o roteiro para duas pessoas estão na main: [Revisão](https://github.com/JoeyAlanS/processador-consultas/blob/main/docs/REVISAO.md) e [Apresentação](https://github.com/JoeyAlanS/processador-consultas/blob/main/docs/APRESENTACAO.md).
