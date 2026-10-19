# Processador de Consultas

Aplicação acadêmica com **lógica de consultas inteiramente em Python**: analisa SQL, valida referências no esquema **BD_Vendas**, converte consultas para álgebra relacional, mostra os grafos original e otimizado e executa os planos sobre registros fictícios. Implementa os requisitos dos documentos fornecidos e o cronograma de outubro de 2026. HTML/CSS/JavaScript são usados para apresentar a interface no navegador; o navegador envia a consulta para a API Python e recebe os resultados prontos.

As quatro versões cumulativas das entregas estão descritas em [ENTREGAS.md](ENTREGAS.md), com links para cada branch, prazos, commits, testes e explicação do código. A `main` mantém a aplicação completa; cada branch de entrega contém apenas os recursos da etapa correspondente e das anteriores.

A revisão de 14/10/2026 está em [Falhas e correções](docs/REVISAO.md), com casos reproduzidos, código antes/depois e validação. O [Roteiro para duas pessoas](docs/APRESENTACAO.md) divide a demonstração, os algoritmos e as correções. As branches atuais são `entrega-1`, `entrega-2`, `entrega-3` e `entrega-4`.

O [comparativo da entrega 1 para a entrega 2](docs/COMPARATIVO_ENTREGAS_1_E_2.md) explica as mudanças de código e interface, com capturas reais, exemplos de álgebra e roteiro de demonstração. Também está disponível em [PDF](output/pdf/comparativo-entrega-1-entrega-2.pdf).

## Executar

Requer **Python 3.10 ou superior**, usando somente a biblioteca padrão. Não precisa de Node.js, npm, Flask, Django ou instalação de pacotes.

```powershell
python server.py
```

Abra **http://localhost:3000**. O servidor atende somente na máquina local. Para outra porta: `python server.py --port 3001`.

No Windows, também pode executar ou clicar duas vezes em **iniciar.cmd**:

```powershell
.\iniciar.cmd
```

Esse iniciador procura `python`, depois `py -3` e, quando disponível, o runtime Python já fornecido pelo Codex. Isso permite iniciar nesta máquina mesmo sem Python configurado no PATH. Se nenhum interpretador estiver disponível, ele informa a necessidade de instalar Python 3.10 ou superior.

```powershell
python -m unittest discover -s tests -v
```

No Windows, alternativa com a mesma descoberta do interpretador: `.\testar.cmd`.

## Demonstração

1. Carregue **Produtos e categorias** e clique em **Processar consulta** (ou Ctrl+Enter).
2. Veja tabelas, filtros e projeções no **Grafo de operadores**. As setas indicam o fluxo de baixo para cima; os números indicam a ordem de execução. Clique em um nó para ver a expressão completa.
3. Use **Original**, **Otimizado** e **Comparar** para mostrar as transformações.
4. Abra **Plano de execução** para observar entradas, saídas, atributos e estimativas.
5. Confira **Resultados** e a verificação de equivalência. **Parser** mostra tokens e referências resolvidas; **Esquema do banco** lista os campos válidos.
6. Carregue **Campo inválido** para demonstrar o erro com linha e coluna. Experimente `DELETE FROM Produto` para demonstrar a rejeição de comandos fora do escopo.
7. Exporte o resultado em CSV pela aba **Resultados**.

## Subconjunto SQL

Suporta `SELECT`, `FROM`, `WHERE`, `INNER JOIN … ON` (também `JOIN`), `AND`, `=`, `>`, `<`, `<=`, `>=`, `<>`, agrupamento de predicados com parênteses, tabelas separadas por vírgulas, aliases com ou sem `AS`, `*`, `alias.*` e comentários `--`. Nomes de tabelas, campos e aliases ignoram maiúsculas/minúsculas. Textos usam aspas simples e apóstrofos duplicados (`'D''Ávila'`). Números aceitam sinal e ponto decimal. Ponto e vírgula final é opcional.

```sql
SELECT p.Nome, p.Preco, c.Descricao
FROM Produto AS p
INNER JOIN Categoria AS c ON p.Categoria_idCategoria = c.idCategoria
WHERE p.Preco > 200 AND c.Descricao = 'Informática';
```

Não suporta `OR`, funções, agregações, `GROUP BY`, `ORDER BY`, `DISTINCT`, subconsultas, junções externas, aliases de coluna ou operações de escrita. Não é um SGBD completo. A interface apresenta os resultados e a ordem de cada operação, além de executar efetivamente as consultas de demonstração.

Comparações entre números e textos geram erro em vez de coerção implícita. Comparações com `NULL` não passam pelos filtros. As strings são comparadas de forma exata, com distinção de maiúsculas; não há configuração de collation. Datas dos exemplos são strings ISO. Para `SELECT` sem `DISTINCT`, as projeções preservam duplicatas (semântica de multiconjunto). A ordem das linhas não é garantida e a comparação dos planos respeita a multiplicidade das linhas.

Literais inteiros são lidos diretamente como `int`, preservando sua precisão no Python; decimais continuam usando `float`. A aba Parser mostra a grafia original dos literais. Unicode inválido é rejeitado como erro de consulta, com HTTP 422.

## Arquitetura e algoritmos

| Arquivo | Responsabilidade |
| --- | --- |
| `data/catalog.json` | Definição das dez tabelas, dados fictícios e exemplos |
| `consulta/schema.py` | Carregamento do catálogo e metadados para a interface |
| `consulta/parser.py` | Lexer com posições, parser recursivo, AST e validação semântica |
| `consulta/planner.py` | Grafos de operadores, álgebra relacional, otimizador e ordem de execução |
| `consulta/executor.py` | Execução em pós-ordem, métricas e equivalência de multiconjuntos |
| `consulta/processor.py` | Pipeline completo de processamento da consulta |
| `server.py` | Servidor HTTP local e API JSON, em Python |
| `app.js` | Apresentação da interface, requisições à API, desenho SVG e exportação CSV |
| `tests/test_processor.py` | Testes dos algoritmos e de resultados conhecidos |
| `tests/test_server.py` | Testes de integração da API, erros e arquivos estáticos |
| `sql/bd-vendas.sql` | Criação opcional do esquema em MySQL |

Os nós, predicados resolvidos, rótulos, estimativas, ordem de execução, álgebra, resultados, métricas e verificação de equivalência são gerados no backend Python. O JavaScript apenas posiciona e desenha os elementos gráficos, apresenta os dados recebidos e controla a interação do usuário.

### API local

| Método e rota | Comportamento |
| --- | --- |
| `GET /api/health` | Confirma que o backend Python está ativo |
| `GET /api/catalog` | Catálogo, contagens dos exemplos e consultas de demonstração |
| `POST /api/process` | Recebe `{"sql": "SELECT ..."}` e devolve a análise completa |

Consultas inválidas retornam HTTP 422 com mensagem, posição, linha e coluna; requisições JSON inválidas retornam 400. A API serve apenas arquivos estáticos explicitamente permitidos, sem expor os módulos Python nem o arquivo de dados diretamente.

O pacote também pode ser utilizado sem navegador:

```python
from consulta import process_query

analise = process_query("SELECT Nome FROM Produto WHERE Preco > 200")
print(analise["algebra"]["optimized"])
print(analise["optimizedResult"]["rows"])
```

Cada nó possui identificador, tipo, filhos, colunas e cardinalidade estimada. As arestas ligam os resultados dos filhos ao operador pai. O plano original segue a ordem das tabelas e aplica o `WHERE` após suas combinações. O plano otimizado:

1. Decompõe as conjunções em predicados independentes.
2. Antecipa predicados que referenciam uma única tabela, inclusive os de `ON` em junções internas.
3. Aplica primeiro filtros com maior restrição estimada.
4. Antecipa projeções, conservando os campos de saída e os usados em predicados entre tabelas. Campos usados apenas em filtros locais podem ser removidos depois do filtro. Uma projeção sem atributos mantém a multiplicidade das tuplas.
5. Começa pela relação com menor cardinalidade estimada após filtros.
6. Escolhe a próxima relação por conexão com o conjunto já processado e menor cardinalidade resultante estimada. Predicados entre tabelas tornam-se condições de junção. Produtos cartesianos permanecem apenas quando não há ligação disponível.
7. Reaplica a projeção final na ordem do `SELECT`.

A cardinalidade inicial é o tamanho da amostra. Fatores heurísticos: `=` → 0,10; `<>` → 0,90; demais comparações → 0,33. As estimativas são didáticas e não representam estatísticas reais de seletividade nem um otimizador por custo completo. A interface distingue estimativas de contagens efetivas e **não promete** que toda consulta ficará mais barata: projeções extras também custam trabalho. Células intermediárias são a soma de tuplas × atributos materializados em todos os nós, incluindo a saída; unidades de trabalho contam linhas visitadas e pares testados, sem equivaler a tempo de execução.

Cada plano tem limites de 50.000 tuplas intermediárias e 500.000 unidades de trabalho. A entrada tem limite de 20.000 caracteres e 100 níveis de parênteses. Se o plano original exceder o limite mas o otimizado puder executar, a interface informa que a equivalência não foi verificada. O código não usa `eval` nem executa SQL em serviços externos.

## Requisitos e entregas

| Data | Entrega | Onde demonstrar |
| --- | --- | --- |
| 15/10/2026 | Interface gráfica funcional | Editor, exemplos e navegação |
| 15/10/2026 | Parser da string | Aba Parser |
| 15/10/2026 | Validação de campos e comandos | Exemplo Campo inválido e mensagens de erro |
| 20/10/2026 | Conversão para álgebra relacional | Expressão sob o grafo |
| 20/10/2026 | Grafo não otimizado | Modo Original |
| 22/10/2026 | Heurísticas de projeção e seleção | Modo Otimizado, nós π e σ antecipados |
| 27/10/2026 | Demais heurísticas | Exemplo Pedidos por cliente e Junção no WHERE |

O documento de entregas indica penalidade **−1 por item**. A implementação também mostra o grafo otimizado e a ordem de execução, previstos nos critérios de avaliação do projeto. “Implementado” na interface não significa que o trabalho foi entregue à disciplina.

## Banco opcional

O projeto usa o catálogo e registros em memória; MySQL é opcional, conforme o enunciado. `sql/bd-vendas.sql` cria as dez tabelas com PKs e FKs, sem popular dados. Para usar o script, execute-o em um ambiente MySQL. A aplicação não se conecta automaticamente a esse banco.
