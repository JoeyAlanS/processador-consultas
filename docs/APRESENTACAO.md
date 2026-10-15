# Roteiro de apresentação para duas pessoas

Roteiro sugerido de aproximadamente **14 minutos** para a aplicação completa, em `main` ou `entrega-4`. Os nomes ficam como **Pessoa 1** e **Pessoa 2** para a equipe preencher. A adaptação à entrega de 15/10 está ao final; cada branch deve demonstrar somente os recursos presentes nela.

## Preparação conjunta

Antes da apresentação, escolham a branch, encerrem qualquer servidor da versão anterior e executem:

```powershell
git switch main
.\iniciar.cmd
```

Abram http://localhost:3000. Deixem disponíveis a interface, este roteiro, [REVISAO.md](REVISAO.md), os módulos Python e os arquivos de teste. Para conferir a versão antes de apresentar: `.\testar.cmd`, ou `python -B -m unittest discover -s tests -v`.

| Responsável | Tempo sugerido | Assunto | Código a mostrar |
| --- | --- | --- | --- |
| Pessoa 1 | 0–1 min | Objetivo e arquitetura | `server.py`, `consulta/processor.py` |
| Pessoa 1 | 1–3 min | Interface, catálogo, tokens e AST | `app.js`, `consulta/schema.py`, `consulta/parser.py` |
| Pessoa 1 | 3–5 min | Validação e mensagens de erro | `validate`, `QueryError`, tratamento HTTP |
| Pessoa 1 | 5–7 min | Correções de inteiros e Unicode | `tokenize`, `parse`, testes de regressão |
| Pessoa 2 | 7–9 min | Grafo original e álgebra | `consulta/planner.py` |
| Pessoa 2 | 9–11 min | Seleção, projeção e demais heurísticas | `build_plan` |
| Pessoa 2 | 11–13 min | Execução, equivalência e precisão dos literais | `consulta/executor.py`, `app.js` |
| Pessoa 2 | 13–14 min | Testes, limpeza e branches | `tests/`, `ENTREGAS.md`, `REVISAO.md` |

## Pessoa 1: entrada, parsing, validação e correções

### 1. Objetivo e arquitetura

Fala sugerida:

> “O projeto recebe uma consulta SQL de um subconjunto definido, verifica sua estrutura e seus campos e permite observar os operadores relacionais. A lógica está em Python. O navegador apresenta a interface, envia a string à API e desenha as informações recebidas. Usamos o esquema BD_Vendas com dez tabelas e dados fictícios; não precisamos de conexão com MySQL para a demonstração.”

Mostre `POST /api/process` em `server.py` e o início de `process_query`:

```python
query = validate(parse(sql))
original = build_plan(query, False, data)
optimized = build_plan(query, True, data)
```

Explique a separação: o parser entende a entrada, o validador resolve referências e o planejador recebe uma consulta já válida. A execução é apresentada pela Pessoa 2.

### 2. Demonstração do parser

Carregue **Produtos por preço**, processe e abra **Parser**:

```sql
SELECT Nome, Preco FROM Produto
WHERE Preco > 200 AND QuantEstoque >= 15;
```

Mostre os tokens com posições e a estrutura `columns`, `tables`, `joins`, `where` e `tokens`. Aponte `tokenize` e a classe `Parser` em `consulta/parser.py`. Explique que o parser descendente reconhece SELECT/FROM, junções internas, WHERE, AND e parênteses; não executa SQL num banco externo.

Abra **Esquema do banco** e associe a lista à leitura de `data/catalog.json` em `consulta/schema.py`. Explique que esse catálogo define quais tabelas e campos podem ser usados.

### 3. Validação semântica e erros

Mostre `validate` e a função interna `resolve`. Elas procuram a tabela, conferem o alias e resolvem o campo para uma chave como `p.Nome`. Demonstre:

```sql
SELECT Nome, Valor FROM Produto;
```

Resultado esperado: erro de campo inexistente com linha e coluna. Em seguida:

```sql
DELETE FROM Produto;
```

Resultado esperado: rejeição do comando fora do subconjunto aceito. Se houver tempo, demonstre ambiguidade:

```sql
SELECT Nome FROM Produto p, Cliente c;
```

Mostre `QueryError` e o `except QueryError` em `server.py`. Explique que um erro de consulta retorna HTTP 422, enquanto o editor recebe a posição para destacar o problema. A posição usa UTF-16 no navegador, inclusive quando há emoji antes do campo errado.

### 4. Inteiros grandes: falha reproduzida e correção

Use esta consulta na versão revisada:

```sql
SELECT Nome FROM Produto
WHERE 9007199254740993 = 9007199254740992;
```

Abra Parser para mostrar os dígitos corretos. Na versão completa, mostre **0 tuplas** em Resultados. Antes da correção, a execução retornava 8 linhas porque os dois valores se tornavam iguais após o arredondamento.

Mostre o trecho atual de `tokenize`:

```python
literal = match.group()
value = float(literal) if "." in literal else int(literal)
```

Explique que o tratamento completo também rejeita conversões inválidas e valores float não finitos. Inteiros não passam mais por float; decimais continuam usando float. Mostre `test_integer_literals_preserve_precision` em `tests/test_processor.py` e o caso antes/depois no relatório. Não é necessário voltar a uma versão defeituosa durante a apresentação.

### 5. Unicode inválido: correção de HTTP 500 para 422

Mostre a validação em `parse`:

```python
for position, character in enumerate(sql):
    if 0xD800 <= ord(character) <= 0xDFFF:
        raise QueryError("A consulta contém um caractere Unicode inválido.", position)
```

Explique que um JSON pode trazer uma unidade substituta isolada como `\ud800`. Antes, a resposta falhava ao codificar em UTF-8 e virava HTTP 500. Agora a entrada é rejeitada no início com HTTP 422 e posição. Acentos e emoji válidos continuam funcionando.

Mostre `test_invalid_unicode_returns_query_error_and_server_stays_available` em `tests/test_server.py`: o teste verifica o erro e consulta `/api/health` depois. Essa falha é melhor apresentada pelo teste, porque um caractere inválido não tem uma forma visual confiável para digitar no editor.

Transição sugerida:

> “Com a entrada validada e os literais preservados, a consulta chega ao planejador. A segunda parte mostra como os operadores são construídos e como verificamos que as transformações mantêm o resultado.”

## Pessoa 2: planos, execução, precisão e repositório

### 1. Plano original e álgebra

Carregue **Junção no WHERE**, abra **Grafo de operadores** e selecione **Original**:

```sql
SELECT p.Nome, c.Descricao
FROM Produto p, Categoria c
WHERE p.Categoria_idCategoria = c.idCategoria AND p.Preco < 300;
```

Mostre as leituras, `×`, `σ` e a projeção final `π`. Aponte a expressão de álgebra abaixo do grafo. Explique `build_plan(..., False)`, `relational_algebra` e `execution_order` em `consulta/planner.py`: o plano original preserva a ordem do SQL; a pós-ordem coloca os filhos antes do operador pai.

### 2. Heurísticas

Use **Comparar**. Explique na ordem:

1. Seleção antecipada: o filtro `p.Preco < 300` é aplicado perto da leitura de Produto.
2. Projeção antecipada: permanecem os campos de saída e a chave `p.Categoria_idCategoria` necessária à condição com Categoria. Um campo de junção não pode ser descartado antes do uso.
3. Na entrega final, o predicado entre tabelas transforma o produto cartesiano em junção.

No código, mostre `required`, `filters`, `kept` e a escolha de `candidates` na parte otimizada de `build_plan`.

Carregue **Pedidos por cliente** e mostre que o plano começa por Status filtrado com `s.idStatus = 2`. Explique que os filtros são ordenados pela restrição estimada e as relações são escolhidas por cardinalidade estimada e conexão. Os fatores são didáticos: igualdade 0,10; `<>` 0,90; faixas 0,33. Não diga que são estatísticas reais do banco nem que toda consulta fica necessariamente mais rápida.

### 3. Execução e preservação dos resultados

Abra **Plano de execução** e **Resultados**. Mostre `execute` em `consulta/executor.py`, as entradas e saídas dos operadores e as métricas de tuplas, atributos e células materializadas.

Mostre a comparação de resultados:

```python
return left["columns"] == right["columns"] and Counter(map(tuple, left["rows"])) == Counter(map(tuple, right["rows"]))
```

Explique que a ordem das linhas pode mudar, mas cada tupla deve manter sua multiplicidade. Projeções não eliminam duplicatas; comparar conjuntos simples seria insuficiente. Se o plano original exceder um limite, a interface informa que a equivalência não foi verificada, em vez de afirmar uma verificação que não ocorreu.

### 4. Precisão dos literais na interface

Retorne à consulta com os dois inteiros grandes e mostre que Parser apresenta `token.raw ?? token.value`. Explique que Python preserva os inteiros e que a interface utiliza a grafia original dos tokens para apresentar seus dígitos.

A interface atual usa o título Processador de consultas, a marca Consulta e não oferece exportação da análise JSON. Nas versões com executor, a exportação CSV continua disponível em Resultados.

### 5. Limpeza, testes e branches

Mostre [ENTREGAS.md](../ENTREGAS.md) e o relatório de revisão. As branches são curtas e continuam separadas por etapa:

| Branch | Prazo | Conteúdo acumulado | Testes atuais |
| --- | --- | --- | --- |
| `entrega-1` | 15/10/2026 | Interface, parser e validação | 22 |
| `entrega-2` | 20/10/2026 | Álgebra e grafo original | 24 |
| `entrega-3` | 22/10/2026 | Seleção/projeção e execução comparativa | 40 |
| `entrega-4` | 27/10/2026 | Demais heurísticas | 40 |

A main também passou nos 40 testes. Mostre os cinco testes novos e explique que a suite inclui 100 consultas comparadas com uma referência independente nas versões com executor. Foram removidos auxiliares redundantes, declarações sem uso nas etapas iniciais e comentários que apenas repetiam a documentação. Catálogo, SQL opcional, testes e iniciadores Windows continuam presentes.

Explique que a publicação das novas branches e a conferência de seus históricos precederam a exclusão dos nomes antigos. As versões são recortes organizados a partir do projeto completo existente; os prazos não foram usados para fabricar datas de commits. A equipe ainda precisa realizar a submissão acadêmica.

## Adaptação para a primeira entrega de 15/10/2026

Use `entrega-1`, não a versão completa, quando a apresentação for exclusivamente dessa entrega.

- **Pessoa 1:** objetivo, interface, catálogo, lexer, tokens e AST. Demonstre um SELECT válido e a preservação dos literais inteiros na aba Parser.
- **Pessoa 2:** validação de campos, comandos e aliases; erros com posição; correção de Unicode e os 22 testes da etapa.
- Não abra grafos, resultados ou otimizador: eles não existem nessa versão. Consulte o README para explicar as etapas seguintes.

Na entrega 2, acrescentem álgebra e grafo original. Na entrega 3, mostrem seleção/projeção e a execução comparativa, explicando que a ordem das tabelas permanece a do SQL e o produto cartesiano da junção no WHERE ainda existe. Reservem reordenação e conversão em junção para a entrega 4.

## Respostas curtas para perguntas comuns

| Pergunta | Resposta fundamentada |
| --- | --- |
| A lógica está em JavaScript? | Não. Parsing, validação, planos, álgebra, heurísticas e execução são Python; JavaScript apresenta e exporta os dados recebidos. |
| Precisa de MySQL? | Não para a demonstração. Os dados são fictícios em memória; `sql/bd-vendas.sql` é opcional e não foi executado nesta revisão. |
| O parser aceita qualquer SQL? | Não. O README lista o subconjunto; OR, agregações, subconsultas e comandos de alteração não são aceitos. |
| Como provam que a otimização está correta? | Comparação de colunas e contadores de tuplas, resultados conhecidos e consultas verificadas por referência independente. Isso fornece evidência de testes, sem prometer cobertura de todas as entradas possíveis. |
| Por que os testes anteriores não acharam o inteiro errado? | Ambos os planos recebiam o mesmo literal arredondado. Os testes novos verificam a entrada e um resultado esperado independente. |
