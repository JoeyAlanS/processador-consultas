# Branches e evolução das entregas

O cronograma fornecido agrupa os sete requisitos em quatro entregas. Cada branch abaixo contém uma versão executável cumulativa, com código, interface, testes, README e um guia `ENTREGA.md` próprios. A lógica de consultas permanece em Python em todas as etapas.

| Entrega | Prazo | Requisitos novos | Total acumulado | Branch e explicação | Base histórica | Testes atuais |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 15/10/2026 | Interface gráfica, parser da string e validação de campos/comandos | 3 | [entrega-1](https://github.com/JoeyAlanS/processador-consultas/blob/entrega-1/ENTREGA.md) | [4f268a7](https://github.com/JoeyAlanS/processador-consultas/commit/4f268a7) | 22 aprovados |
| 2 | 20/10/2026 | Conversão para álgebra relacional e grafo não otimizado | 5 | [entrega-2](https://github.com/JoeyAlanS/processador-consultas/blob/entrega-2/ENTREGA.md) | [fae833d](https://github.com/JoeyAlanS/processador-consultas/commit/fae833d) | 24 aprovados |
| 3 | 22/10/2026 | Heurísticas de projeção e seleção | 6 | [entrega-3](https://github.com/JoeyAlanS/processador-consultas/blob/entrega-3/ENTREGA.md) | [e15305b](https://github.com/JoeyAlanS/processador-consultas/commit/e15305b) | 40 aprovados |
| 4 | 27/10/2026 | Demais heurísticas | 7 | [entrega-4](https://github.com/JoeyAlanS/processador-consultas/blob/entrega-4/ENTREGA.md) | [6d1a5cb](https://github.com/JoeyAlanS/processador-consultas/commit/6d1a5cb) | 40 aprovados |

As quantidades representam requisitos do cronograma, não uma distribuição de notas. O documento indica penalidade de −1 por item. Disponibilidade do código não significa submissão à disciplina.

## O que mudou no código

**Entrega 1:** conserva `consulta/parser.py`, catálogo, validação e servidor Python. `process_query` retorna a consulta validada, seus tokens e predicados. Não possui `consulta/planner.py` nem `consulta/executor.py`. A interface oferece Parser, Esquema e Entregas e mostra os requisitos seguintes como etapas futuras.

**Entrega 2:** introduz `consulta/planner.py`. O plano original respeita a ordem das tabelas do SQL, aplica as condições de ON nas junções, mantém produtos cartesianos e coloca o WHERE após as combinações. Acrescenta a álgebra calculada em Python, o desenho SVG e a inspeção dos operadores. Ainda não executa registros nem aplica heurísticas.

**Entrega 3:** acrescenta seleção e projeção próximas às leituras. Conserva os campos de saída e os necessários aos predicados entre tabelas, preserva duplicatas e mantém a ordem das relações e dos filtros. Produtos cartesianos com condições no WHERE continuam nesta versão. Introduz `consulta/executor.py`, execução comparativa, métricas e exportação CSV para demonstrar a equivalência das transformações.

**Entrega 4:** ordena filtros pela restrição estimada, inicia pela relação com menor cardinalidade estimada, escolhe relações por conexão e tamanho estimado do resultado e transforma produtos cartesianos com predicados entre tabelas em junções. Conserva produtos necessários quando não há ligação. O backend corresponde à versão completa já disponível na `main`.

Cada `ENTREGA.md` explica as funções do parser, a representação da consulta, os algoritmos disponíveis, as mudanças da etapa, exemplos, limites e roteiro de apresentação. Cada README explica como executar a versão e quais requisitos estão disponíveis. JavaScript apenas controla a interface e apresenta os dados enviados pela API Python.

## Histórico e datas

A base `9496846` já continha o projeto completo. As branches foram organizadas depois, recortando a primeira versão e acrescentando os módulos em sequência:

```text
9496846 — projeto completo existente
  ├─ main — aplicação completa e índice das entregas
  └─ 4f268a7 — entrega 1: interface, parser e validação
       └─ fae833d — entrega 2: álgebra e grafo original
            └─ e15305b — entrega 3: seleção e projeção
                 └─ 6d1a5cb — entrega 4: demais heurísticas
```

As datas nos nomes das branches são os prazos acadêmicos enviados pelo usuário. Os commits mantêm a data real de criação; não foi fabricado um histórico anterior nem alterado o primeiro commit publicado. As bases das etapas 2, 3 e 4 descendem da etapa anterior. Cada versão recebeu depois uma revisão própria, mantendo seus commits históricos. A `main` mantém sua linha de desenvolvimento com a aplicação completa.

## Abrir e comparar versões

No repositório local, selecione a entrega desejada:

```powershell
git fetch origin
git switch entrega-1
.\iniciar.cmd
```

Abra http://localhost:3000. Encerre o servidor com Ctrl+C antes de trocar de branch, pois os módulos Python são carregados ao iniciar. Em um clone novo, `git switch` cria a branch local acompanhando a remota correspondente.

Para voltar à versão completa, execute `git switch main`. As outras versões seguem o mesmo comando, substituindo o nome da branch.

Para ver as alterações específicas de uma etapa:

```powershell
git diff entrega-1..entrega-2
git diff entrega-2..entrega-3
git diff entrega-3..entrega-4
```

## Verificação realizada

Todas as branches passaram por `python -B -m unittest discover -s tests -v`, `node --check app.js` e `git diff --check`. Node.js foi usado apenas para conferir a sintaxe da interface; a execução do projeto requer somente Python 3.10 ou superior e a biblioteca padrão.

Também foi conferida a interface de cada versão no navegador: rejeição de comando inválido e situação das entregas na etapa 1; álgebra e produto cartesiano original na etapa 2; filtros/projeções antecipados e resultados equivalentes na etapa 3; conversão em junção e início pela relação mais restritiva na etapa 4. As etapas 3 e 4 incluem um teste que compara 100 consultas com uma referência independente, além de testes de multiplicidade, NULL, chaves preservadas e limites.

O ambiente de preparação e seus arquivos temporários não integram os commits. Os PDFs serviram como referência dos requisitos; a criação das branches e a publicação no GitHub foram solicitadas pelo usuário.

## Revisão e apresentação — 14/10/2026

As branches atuais são `entrega-1` a `entrega-4`, sem prefixo e sem datas nos nomes; os prazos continuam na tabela. A publicação e a conferência do histórico das versões novas precedem a remoção dos nomes antigos. Cada versão recebeu correções de precisão dos inteiros, rejeição de Unicode inválido, apresentação dos tokens e exportação JSON, além de limpeza de código sem uso.

O [relatório detalhado](docs/REVISAO.md) mostra as falhas reproduzidas, os trechos antes e depois, os motivos das mudanças e os testes. O [roteiro para duas pessoas](docs/APRESENTACAO.md) distribui a demonstração e explica como adaptar a primeira entrega. A main passou nos 40 testes; as entregas passaram em 22, 24, 40 e 40 testes, respectivamente.
