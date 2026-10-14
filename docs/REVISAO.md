# Revisão do projeto: falhas, correções e organização

Revisão realizada em **14/10/2026**. A base examinada na `main` foi o commit `d2773cd`. Os 35 testes anteriores passaram antes das alterações. Mesmo assim, casos adicionais reproduziram falhas numéricas e de tratamento de entrada, que agora têm testes de regressão. Este documento distingue defeitos de funcionamento, ajustes de apresentação e limpeza; não atribui ao projeto falhas que não foram demonstradas.

## 1. Precisão perdida ao ler literais inteiros

Arquivo: [consulta/parser.py](../consulta/parser.py), função `tokenize`.

### Evidência

Consulta executada antes da correção, com os dados fictícios originais:

```sql
SELECT Nome FROM Produto
WHERE 9007199254740993 = 9007199254740992;
```

São inteiros diferentes. A consulta deveria retornar zero linhas, mas retornava **8 linhas**. O lexer transformava `9007199254740993` em `9007199254740992`. Um segundo caso, usando `process_query(sql, data)` com um identificador `9007199254740993`, deixava de encontrar a linha esperada.

### Código anterior

```python
value = float(match.group())
if not math.isfinite(value):
    raise QueryError("Número fora do intervalo suportado.", start)
if value.is_integer():
    value = int(value)
```

O arredondamento ocorria na primeira conversão. Transformar o valor de volta em `int` não recuperava os dígitos perdidos. O otimizador e o executor recebiam um literal já incorreto; comparar dois planos não detectava a falha, porque ambos usavam a mesma entrada alterada.

### Código corrigido

```python
literal = match.group()
try:
    value = float(literal) if "." in literal else int(literal)
except ValueError as error:
    raise QueryError("Número fora do intervalo suportado.", start) from error
if isinstance(value, float) and not math.isfinite(value):
    raise QueryError("Número fora do intervalo suportado.", start)
if isinstance(value, float) and value.is_integer():
    value = int(value)
tokens.append({"type": "number", "value": value, "raw": literal, "position": start})
```

Literais sem ponto decimal passam diretamente para `int`. Os decimais continuam seguindo a implementação com `float`; esta revisão não introduz aritmética decimal exata nem muda os registros de exemplo. O tratamento de `ValueError` converte valores fora do limite de conversão em erro de consulta. Os filtros, operadores SQL e sinais numéricos permanecem suportados.

### Verificação

- `test_integer_literals_preserve_precision`: confere os dois valores distintos; na versão completa exige resultado vazio e verifica uma busca por identificador grande em dados de teste.
- `test_numeric_token_retains_written_literal`: verifica números grandes com sinais e `.5`.
- `test_integer_comparison_keeps_exact_api_values`: verifica os valores inteiros recebidos pela API com um cliente Python; nas etapas 3 e 4 também verifica o resultado vazio.
- No navegador da versão completa, a consulta passou a mostrar **0 tuplas** e resultados equivalentes.

## 2. Literal numérico alterado na apresentação e na exportação JSON

Arquivos: [consulta/parser.py](../consulta/parser.py) e [app.js](../app.js), funções `requestJson`, `run`, `renderParser` e evento de exportação.

### Causa

Corrigir o Python preserva o número na resposta HTTP, mas a leitura dessa resposta como números JavaScript pode arredondar inteiros grandes. A interface anterior mostrava `token.value` e exportava o objeto já convertido pelo navegador. Por isso o valor original precisava ser preservado também na apresentação e no arquivo exportado.

### Trechos anteriores

```javascript
const payload = await response.json();
// Na apresentação dos tokens: token.value.
download('analise-consulta.json',
  JSON.stringify({ sql: lastSql, ...analysis }, null, 2),
  'application/json');
```

### Trechos corrigidos

```javascript
const raw = await response.text();
const payload = JSON.parse(raw);
return includeRaw ? { payload, raw } : payload;
```

```javascript
const { payload: result, raw } = await requestJson('/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql })
}, true);
```

Depois da verificação de que a resposta pertence à requisição atual, `run` guarda `lastAnalysisJson = raw`. A aba Parser mostra `token.raw ?? token.value`, conservando a grafia que o usuário escreveu, inclusive sinais e casas decimais.

```javascript
const contents = `{"sql":${JSON.stringify(lastSql)},${lastAnalysisJson.trim().slice(1)}`;
download('analise-consulta.json', contents, 'application/json');
```

Somente a string SQL é serializada pelo navegador. O corpo JSON da análise vem da resposta Python já recebida; não há uma segunda serialização dos seus números. A API devolve um objeto JSON, por isso a construção acrescenta o campo `sql` antes dos campos existentes. Erros HTTP continuam sendo tratados antes de guardar a análise.

### Verificação e alcance

A aba Parser foi conferida no navegador com os dois inteiros grandes, exibindo os dígitos corretos. O arquivo realmente baixado por **Exportar análise** foi lido com `json.loads`; os valores eram `9007199254740993` e `9007199254740992`, e o resultado estava vazio. Esse teste também verificou que o arquivo era JSON válido.

A preservação textual abrange tokens e exportação da análise. Consumidores externos que convertam números JSON para um tipo numérico com menor precisão continuam responsáveis pela escolha de seu decodificador. Não houve alteração geral dos tipos dos campos da API.

## 3. Unicode inválido produzia erro interno HTTP 500

Arquivos: [consulta/parser.py](../consulta/parser.py), função `parse`, e [server.py](../server.py), tratamento de `QueryError`.

### Evidência

Foi enviado à API um JSON ASCII com uma unidade substituta Unicode isolada, representada por `\ud800`, dentro da string SQL:

```python
sql = "SELECT Nome FROM Produto WHERE Nome = '\ud800'"
payload = json.dumps({"sql": sql}).encode("ascii")
```

O servidor aceitava a string até a análise. Ao preparar a resposta, `json.dumps(..., ensure_ascii=False).encode("utf-8")` gerava `UnicodeEncodeError`; o cliente recebia **HTTP 500** e a mensagem genérica de falha interna. A entrada era inválida, mas não era identificada como tal.

### Correção

A validação acontece em `parse`, antes da tokenização e antes de qualquer string inválida entrar nos planos ou na resposta:

```python
for position, character in enumerate(sql):
    if 0xD800 <= ord(character) <= 0xDFFF:
        raise QueryError("A consulta contém um caractere Unicode inválido.", position)
```

O tratamento de `QueryError` já existente em `server.py` passa a devolver **HTTP 422**, com a posição do problema. Não foi necessário alterar o contrato de erro do servidor. A regra rejeita unidades substitutas isoladas; caracteres Unicode válidos, como acentos e emoji, permanecem aceitos. A conversão da posição para UTF-16, usada pelo editor no navegador, foi mantida.

### Verificação

- `test_invalid_unicode_is_a_query_error`: verifica unidades substitutas alta e baixa e a posição indicada pelo parser.
- `test_invalid_unicode_returns_query_error_and_server_stays_available`: exige HTTP 422 e consulta `/api/health` depois do erro.
- O teste já existente `test_error_position_matches_browser_utf16` continua passando com emoji válido antes de um campo inexistente.

## 4. Limpeza comprovada no código

A inspeção não encontrou pacotes JavaScript antigos ou pastas de código abandonadas entre os arquivos versionados. Não foram excluídos módulos necessários, catálogo, testes, iniciadores Windows ou o SQL opcional.

| Trecho ou arquivo | Alteração | Motivo |
| --- | --- | --- |
| `const nodeLabel = node => node.label` em `app.js` | Substituído por `node.label` | O auxiliar apenas devolvia a propriedade; na entrega 1 nem era usado |
| `const formatEstimate = number` em `app.js` | Chamadas passam a usar `number` | Alias sem comportamento próprio; nas entregas iniciais havia declaração sem uso |
| `planMode` nas entregas 1 e 2 | Removido | Essas interfaces não oferecem escolha entre planos |
| `format_estimate` em `consulta/planner.py` da entrega 2 | Removido | A etapa original não usa notas de reordenação; a função não era chamada |
| Comentários que apenas repetiam a arquitetura em `app.js` e no retorno do planejador | Removidos | A documentação já explica a divisão entre Python e apresentação |
| Comentário da proteção CSV | Mantido e escrito em português | Explica por que textos com prefixos especiais recebem apóstrofo |
| Rótulo acessível das métricas nas entregas 1 e 2 | Alterado para “Métricas da análise” | Nessas versões não existe execução dos registros |

Comentários sobre multiplicidade das projeções, SQL UNKNOWN e posição UTF-16 foram mantidos porque explicam decisões que não são óbvias. Os arquivos temporários de preparação não são publicados e são removidos ao terminar.

## 5. Branches curtas e preservação das alterações

| Nome anterior | Nome atual | Prazo | Base histórica preservada |
| --- | --- | --- | --- |
| `codex/entrega-1-2026-10-15` | `entrega-1` | 15/10/2026 | `4f268a7` |
| `codex/entrega-2-2026-10-20` | `entrega-2` | 20/10/2026 | `fae833d` |
| `codex/entrega-3-2026-10-22` | `entrega-3` | 22/10/2026 | `e15305b` |
| `codex/entrega-4-2026-10-27` | `entrega-4` | 27/10/2026 | `6d1a5cb` |

Antes da revisão, a árvore de trabalho estava limpa e cada comparação entre branch local e remota indicava `0 0`: não havia commits de um lado ausentes no outro. As novas branches foram criadas a partir dos mesmos commits, e cada versão recebeu sua revisão sem antecipar funcionalidades futuras.

A publicação das versões novas precede a remoção dos nomes antigos. A conferência usa os SHAs remotos e `git merge-base --is-ancestor`: cada ponta antiga deve pertencer ao histórico da nova versão publicada. A exclusão remota usa o SHA esperado como condição, para não apagar uma atualização concorrente. O primeiro commit e os commits históricos das entregas permanecem alcançáveis.

README, guias de entrega e índice usam os nomes e links novos. A tabela acima registra os nomes antigos somente para documentar a migração. A `main` continua sendo a versão completa; as datas continuam sendo os prazos enviados, sem mudar a data real dos commits.

## 6. Validação realizada

| Versão | Antes da revisão | Depois da revisão |
| --- | --- | --- |
| `main` | 35 testes | 40 testes |
| `entrega-1` | 17 testes | 22 testes |
| `entrega-2` | 19 testes | 24 testes |
| `entrega-3` | 35 testes | 40 testes |
| `entrega-4` | 35 testes | 40 testes |

As contagens anteriores das entregas são as registradas na preparação dessas versões; a execução inicial desta revisão foi feita na main. As suites atuais foram executadas em cada versão e passaram. As cinco adições cobrem inteiros exatos, grafia numérica, Unicode inválido no parser, valores numéricos na API e erro Unicode HTTP com servidor ainda disponível.

```powershell
python -B -m unittest discover -s tests -v
node --check app.js
git diff --check
```

Também foram conferidas as quatro interfaces, a preservação dos literais na aba Parser e a ausência de recursos futuros nas etapas iniciais. A exportação JSON da versão completa foi baixada e validada. Os testes anteriores continuam cobrindo aliases, campos inexistentes e ambíguos, escopo do ON, operadores, duplicatas, NULL, chaves das junções, limites e 100 consultas comparadas com uma referência independente nas versões com executor.

A aplicação usa dados fictícios e apenas a biblioteca padrão do Python. Não foi executado um banco MySQL nesta revisão; o script é opcional. Os fatores de seletividade continuam sendo estimativas didáticas, não estatísticas medidas de um SGBD. O subconjunto SQL suportado permanece o descrito no README.

O [roteiro de apresentação](APRESENTACAO.md) distribui esses pontos entre duas pessoas e informa como adaptar a demonstração à entrega escolhida.
