# Guia da entrega 2 — 20/10/2026

Branch: `entrega-2`. Esta é uma versão cumulativa organizada conforme o cronograma fornecido. O prazo identifica a entrega acadêmica; o Git registra a data real dos commits. A base já continha o projeto completo, por isso a primeira branch recorta a etapa inicial e as seguintes acrescentam os recursos em sequência.

## O que está pronto

Acrescenta conversão para álgebra relacional e grafo não otimizado. Mantém a ordem das tabelas e aplica WHERE após as combinações. Esta versão constrói o plano; a execução comparativa entra na próxima etapa.

| Prazo | Requisito | Situação nesta branch |
| --- | --- | --- |
| 15/10/2026 | Interface gráfica existente e funcional | Disponível |
| 15/10/2026 | A string é parseada | Disponível |
| 15/10/2026 | Campos e comandos errados são validados | Disponível |
| 20/10/2026 | Conversão para álgebra relacional | Disponível |
| 20/10/2026 | Grafo não otimizado | Disponível |
| 22/10/2026 | Heurísticas de projeção e seleção | Etapa futura |
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

## Mudanças em relação à entrega 1

- Introduz `consulta/planner.py` com o construtor do plano original, a pós-ordem e a álgebra.
- `processor.py` passa a devolver `original` e `algebra.original`, além da consulta validada.
- Acrescenta o grafo SVG, a expressão relacional e a inspeção de operadores na interface.
- `consulta/executor.py` continua ausente. Não há plano otimizado, reordenação ou execução dos registros.
- Os testes conferem a posição do WHERE, a preservação de produtos cartesianos, o INNER JOIN e a dependência entre nós.

## Roteiro de apresentação

1. Carregue **Produtos e categorias** e abra **Grafo de operadores**.
2. Confira a expressão de álgebra relacional abaixo do grafo e clique nos operadores para ver os campos.
3. Carregue **Junção no WHERE**: o grafo deve manter o produto cartesiano `×`, seguido da seleção `σ`.
4. Confira Parser e Esquema do banco.

## Validação

Foram executados **24 testes** com `python -B -m unittest discover -s tests -v`. A suite verifica entradas válidas e inválidas, catálogo, aliases, ambiguidade, limites do parser, posições de erro e integração HTTP. A partir da entrega 2 verifica também os operadores e sua ordem; a partir da entrega 3 verifica resultados e equivalência.

`node --check app.js` verifica a sintaxe da apresentação, sem tornar Node.js uma dependência da aplicação. `git diff --check` verifica o patch. O README contém os comandos para executar a branch, a API e a matriz de requisitos disponíveis e futuros.

Os documentos foram usados como referência dos requisitos acadêmicos e dos prazos. A organização das branches, commits e publicação foi solicitada pelo usuário. A apresentação ou submissão à disciplina permanece responsabilidade da equipe.

## Revisão do repositório — 14/10/2026

A branch foi renomeada para `entrega-2`, mantendo todos os commits da versão anterior. A revisão corrigiu precisão de inteiros no parser, rejeição de Unicode inválido com erro de consulta, apresentação dos literais numéricos e exportação JSON sem reconversão dos números pelo navegador. Foram removidos auxiliares de apresentação redundantes e, quando presentes, código sem uso. Nenhum recurso de uma entrega futura foi antecipado.

Os documentos detalhados da revisão completa e o roteiro para duas pessoas estão na main: [Revisão](https://github.com/JoeyAlanS/processador-consultas/blob/main/docs/REVISAO.md) e [Apresentação](https://github.com/JoeyAlanS/processador-consultas/blob/main/docs/APRESENTACAO.md).
