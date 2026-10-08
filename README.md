# Processador de Consultas — entrega 4

**Prazo: 27/10/2026 · branch `codex/entrega-4-2026-10-27`.** Completa as heurísticas: prioriza filtros mais restritivos, inicia pela relação com menor cardinalidade estimada, escolhe as próximas relações por conexão e estimativa e substitui produtos cartesianos seguidos de predicados entre tabelas por junções. Inclui execução, métricas e verificação da equivalência dos resultados.

A lógica SQL é inteiramente em **Python**. HTML/CSS/JavaScript apresentam a interface e os dados calculados pelo backend. O código desta branch corresponde à etapa indicada; cada entrega acumula os recursos anteriores.

## Executar e testar

Requer Python 3.10 ou superior, apenas com a biblioteca padrão. Não é necessário instalar pacotes, Node.js ou MySQL.

```powershell
git switch codex/entrega-4-2026-10-27
python server.py
```

Abra http://localhost:3000. No Windows, use também `.\iniciar.cmd`. O iniciador procura `python`, `py -3` e o runtime Python do Codex, quando disponível. Outra porta: `python server.py --port 3001`.

```powershell
python -B -m unittest discover -s tests -v
```

Alternativa Windows: `.\testar.cmd`. Esta etapa foi verificada com **35 testes**, além da sintaxe da interface e da verificação do diff.

## Demonstrar esta entrega

1. Carregue **Junção no WHERE** e compare os grafos: `×` seguido de condição entre tabelas é substituído por `⋈`.
2. Carregue **Pedidos por cliente**: a tabela filtrada mais restritiva deve iniciar o plano.
3. Teste `SELECT Nome FROM Produto WHERE Preco > 10 AND Categoria_idCategoria = 1`: a igualdade passa a ser aplicada primeiro pela estimativa.
4. Confira a ordem dos operadores e as métricas em **Plano de execução**.
5. Confira a equivalência em **Resultados** e exporte o CSV ou a análise JSON.

## Código desta etapa

| Arquivo | Responsabilidade |
| --- | --- |
| `data/catalog.json` | Dez tabelas do BD_Vendas, registros fictícios e consultas de demonstração |
| `consulta/schema.py` | Carrega o catálogo e fornece metadados à interface |
| `consulta/parser.py` | Tokenização com posições, parser, AST e validação semântica |
| `consulta/planner.py` | Constrói os operadores, o grafo e a expressão relacional; inclui as heurísticas desta etapa |
| `consulta/executor.py` | Executa os operadores e compara resultados preservando duplicatas |
| `consulta/processor.py` | Coordena os recursos disponíveis nesta entrega |
| `server.py` | Servidor HTTP local e API JSON em Python |
| `index.html / styles.css / app.js` | Editor, navegação e apresentação dos dados recebidos do Python |
| `tests/` | Testes do parser, do processamento desta etapa e da API |
| `sql/bd-vendas.sql` | Criação opcional do esquema MySQL; a aplicação usa dados em memória |

O guia [ENTREGA.md](ENTREGA.md) explica o fluxo, os algoritmos, as alterações em relação à etapa anterior, os exemplos e a validação. A interface não faz parsing SQL nem escolhe heurísticas.

## Requisitos do cronograma

| Prazo | Requisito | Situação nesta branch |
| --- | --- | --- |
| 15/10/2026 | Interface gráfica existente e funcional | Disponível |
| 15/10/2026 | A string é parseada | Disponível |
| 15/10/2026 | Campos e comandos errados são validados | Disponível |
| 20/10/2026 | Conversão para álgebra relacional | Disponível |
| 20/10/2026 | Grafo não otimizado | Disponível |
| 22/10/2026 | Heurísticas de projeção e seleção | Disponível |
| 27/10/2026 | Demais heurísticas | Disponível |

## Branches cumulativas

| Entrega | Prazo | Situação | Branch |
| --- | --- | --- | --- |
| 1 | 15/10/2026 | Disponível | [codex/entrega-1-2026-10-15](https://github.com/JoeyAlanS/processador-consultas/tree/codex/entrega-1-2026-10-15) |
| 2 | 20/10/2026 | Disponível | [codex/entrega-2-2026-10-20](https://github.com/JoeyAlanS/processador-consultas/tree/codex/entrega-2-2026-10-20) |
| 3 | 22/10/2026 | Disponível | [codex/entrega-3-2026-10-22](https://github.com/JoeyAlanS/processador-consultas/tree/codex/entrega-3-2026-10-22) |
| 4 | 27/10/2026 | Disponível | [codex/entrega-4-2026-10-27](https://github.com/JoeyAlanS/processador-consultas/tree/codex/entrega-4-2026-10-27) |

A `main` mantém a aplicação completa. As branches foram organizadas a partir do projeto já finalizado, com recorte real dos módulos e da interface por etapa. As datas nos nomes são os prazos fornecidos, e os commits conservam sua data real. Disponível não significa entregue à disciplina. O documento informa penalidade de −1 por item.

## SQL e API

Aceita `SELECT`, `FROM`, `WHERE`, `INNER JOIN … ON`, `AND`, `=`, `>`, `<`, `<=`, `>=`, `<>`, parênteses, aliases, `*`, `alias.*`, tabelas separadas por vírgula e comentários `--`. Textos usam aspas simples, números usam ponto decimal e os nomes ignoram maiúsculas/minúsculas. Não aceita `OR`, agregações, subconsultas, `ORDER BY`, `DISTINCT` ou comandos de alteração.

- `GET /api/health`: confirma o backend Python.
- `GET /api/catalog`: catálogo, contagens e exemplos.
- `POST /api/process`: recebe `{"sql": "SELECT ..."}` e devolve a análise disponível nesta etapa.

Erros de consulta retornam HTTP 422 com mensagem, posição, linha e coluna. A API serve somente os arquivos estáticos permitidos e não publica os módulos Python nem o catálogo diretamente.

```python
from consulta import process_query

analise = process_query("SELECT Nome FROM Produto WHERE Preco > 200")
print(analise["algebra"]["optimized"])
print(analise["optimizedResult"]["rows"])
print(analise["verified"])
```

O script `sql/bd-vendas.sql` cria as dez tabelas com chaves no MySQL. Seu uso é opcional; não há conexão automática com o banco. Os dados do projeto são fictícios.
