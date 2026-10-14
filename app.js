const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
let schema = {}, sampleCounts = {}, examples = [], requestSequence = 0;
let analysis = null, activeTab = 'graph', planMode = 'optimized', selectedTable = null, lastSql = '', lastAnalysisJson = '';

$('#table-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-table]');
  if (!button) return;
  selectedTable = button.dataset.table; switchTab('schema');
  document.getElementById(`schema-${selectedTable}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

async function requestJson(url, options = {}, includeRaw = false) {
  let response;
  try { response = await fetch(url, options); }
  catch { throw new Error('Não foi possível acessar o servidor Python. Inicie o projeto com iniciar.cmd ou python server.py.'); }
  const raw = await response.text();
  const payload = JSON.parse(raw);
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Falha ao acessar o servidor Python.'), payload.error);
  return includeRaw ? { payload, raw } : payload;
}

async function run() {
  const request = ++requestSequence;
  const sql = $('#sql').value;
  $('#error').hidden = true;
  $('#status').classList.remove('pending');
  $('#status').textContent = 'Processando consulta no servidor Python…';
  $('#run').disabled = true;
  $('#run').textContent = 'Processando…';
  $('#export').disabled = true;
  try {
    const { payload: result, raw } = await requestJson('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) }, true);
    if (request !== requestSequence) return;
    analysis = result;
    lastSql = sql;
    lastAnalysisJson = raw;
    $('#status').textContent = analysis.verified ? '✓ Consulta válida · planos executados com resultados equivalentes.' : '✓ Consulta válida · plano otimizado executado. O plano original excedeu o limite didático.';
    $('.pipeline-card').classList.add('complete');
    const changed = $('#sql').value !== sql;
    $('#export').disabled = changed;
    if (changed) {
      $('#status').classList.add('pending');
      $('#status').textContent = 'Consulta alterada · clique em Processar para atualizar a análise abaixo.';
    }
    renderMetrics(); renderPanel();
  } catch (error) {
    if (request !== requestSequence) return;
    analysis = null;
    $('.pipeline-card').classList.remove('complete');
    $('#export').disabled = true;
    $('#metrics').innerHTML = '';
    $('#status').textContent = 'A consulta precisa de uma correção.';
    $('#error').hidden = false;
    const position = error.position ?? 0;
    const before = sql.slice(0, position);
    const line = error.line ?? before.split('\n').length, column = error.column ?? before.length - before.lastIndexOf('\n');
    $('#error').innerHTML = `<strong>Não foi possível processar a consulta</strong>${escape(error.message)} <span>(linha ${line}, coluna ${column})</span>`;
    $('#sql').focus(); $('#sql').setSelectionRange(position, position + 1);
    renderPanel();
  } finally {
    if (request === requestSequence) {
      $('#run').disabled = false;
      $('#run').textContent = '▶ Processar consulta';
    }
  }
}
$('#run').addEventListener('click', run);
$('#sql').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); } });
$('#sql').addEventListener('input', () => {
  $('#status').classList.add('pending');
  $('#status').textContent = 'Consulta alterada · clique em Processar para atualizar a análise abaixo.';
  $('#export').disabled = true;
});
$('#example').addEventListener('change', event => {
  if (event.target.value === '') return;
  $('#sql').value = examples[Number(event.target.value)].sql; run();
});
$('#export').addEventListener('click', () => {
  if (!analysis) return;
  const contents = `{"sql":${JSON.stringify(lastSql)},${lastAnalysisJson.trim().slice(1)}`;
  download('analise-consulta.json', contents, 'application/json');
});
function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[role=tab]').forEach(button => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  });
  $('#panel').setAttribute('aria-labelledby', `tab-${tab}`);
  renderPanel();
}
$('.tabs').addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) switchTab(button.dataset.tab); });
$('.tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...document.querySelectorAll('[role=tab]')], index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  switchTab(buttons[next].dataset.tab); buttons[next].focus();
});
function renderMetrics() {
  const original = analysis.originalResult, optimized = analysis.optimizedResult;
  const saving = original?.cells ? Math.round((1 - optimized.cells / original.cells) * 100) : null;
  const metrics = [
    ['Tabelas consultadas', analysis.query.tables.length, '', 'Validadas no catálogo BD_Vendas'],
    ['Operações no plano', analysis.optimized.order.length, '', 'Leitura, filtros, projeções e junções'],
    ['Tuplas no resultado', optimized.rows.length, '', analysis.verified ? 'Equivalência verificada entre os planos' : 'Plano original excedeu o limite'],
    ['Células intermediárias', optimized.cells, saving === null ? '' : `${saving >= 0 ? '↓' : '↑'} ${Math.abs(saving)}%`, original ? `${number(original.cells)} no plano original · inclui a saída` : 'Soma de tuplas × atributos em cada operação'],
  ];
  $('#metrics').innerHTML = metrics.map(([label, value, change, description]) => `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">${number(value)}<small>${change}</small></span><span class="metric-foot">${description}</span></div>`).join('');
}
function heading(title, subtitle, controls = '') {
  return `<div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${controls}</div>`;
}
function modeControls(compare = false) {
  const modes = [['optimized', 'Otimizado'], ['original', 'Original'], ...(compare ? [['compare', 'Comparar']] : [])];
  return `<div class="segmented" aria-label="Plano exibido">${modes.map(([mode, label]) => `<button data-mode="${mode}" class="${planMode === mode ? 'active' : ''}" aria-pressed="${planMode === mode}">${label}</button>`).join('')}</div>`;
}
function renderPanel() {
  if (activeTab === 'schema') return renderSchema();
  if (activeTab === 'deliveries') return renderDeliveries();
  if (!analysis) { $('#panel').innerHTML = '<div class="empty">Insira uma consulta válida para explorar sua análise.</div>'; return; }
  if (activeTab === 'graph') renderGraph();
  else if (activeTab === 'plan') renderExecution();
  else if (activeTab === 'result') renderResults();
  else if (activeTab === 'parser') renderParser();
  $('#panel').querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { planMode = button.dataset.mode; renderPanel(); }));
}

function wrap(text, max = 34) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (word.length > max) {
      if (line) { lines.push(line); line = ''; }
      for (let offset = 0; offset < word.length; offset += max) lines.push(word.slice(offset, offset + max));
    } else if (line.length + word.length + 1 > max) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines.length > 4 ? [...lines.slice(0, 3), lines[3].slice(0, max - 1) + '…'] : lines;
}
function graphSvg(plan, mode) {
  const nodes = [], edges = [];
  let leaf = 0;
  const order = new Map(plan.order.map(node => [node.id, node.step]));
  const nodeWidth = 270, stride = 302;
  function layout(node, y) {
    const lines = wrap(node.label);
    const height = 61 + lines.length * 14;
    const children = node.children.map(child => layout(child, y + height + 38));
    const x = children.length ? children.reduce((sum, child) => sum + child.x, 0) / children.length : 22 + nodeWidth / 2 + leaf++ * stride;
    const positioned = { node, x, y, height, lines }; nodes.push(positioned);
    children.forEach(child => edges.push({ from: child, to: positioned }));
    return positioned;
  }
  layout(plan.root, 24);
  const width = Math.max(314, leaf * stride + 12);
  const height = Math.max(...nodes.map(node => node.y + node.height)) + 24;
  const edgeMarkup = edges.map(({ from, to }) => `<path d="M ${from.x} ${from.y} L ${from.x} ${from.y - 19} L ${to.x} ${from.y - 19} L ${to.x} ${to.y + to.height + 3}" fill="none" stroke="#b7bdcf" stroke-width="1.5" marker-end="url(#arrow-${mode})"/>`).join('');
  const nodeMarkup = nodes.map(({ node, x, y, height, lines }) => {
    const color = node.type === 'select' ? '#198f79' : node.type === 'scan' ? '#6084b5' : node.type === 'cross' ? '#b87a36' : '#7a66ce';
    return `<g class="graph-node" role="button" tabindex="0" aria-label="${escape(node.name + ': ' + node.label)}" data-node="${node.id}" data-plan="${mode}"><title>${escape(node.label)}</title><rect x="${x - nodeWidth / 2}" y="${y}" width="${nodeWidth}" height="${height}" rx="8" fill="#fff" stroke="#dfe2ed"/><rect x="${x - nodeWidth / 2}" y="${y}" width="4" height="${height}" rx="2" fill="${color}"/><text x="${x - 117}" y="${y + 23}" fill="${color}" font-family="Georgia,serif" font-size="18">${node.symbol}</text><text x="${x - 91}" y="${y + 22}" fill="#56617a" font-size="10" font-weight="600">${node.name}</text><rect x="${x + 103}" y="${y + 9}" width="23" height="19" rx="4" fill="#f4f2fb"/><text x="${x + 114.5}" y="${y + 22}" text-anchor="middle" fill="#8d7aba" font-size="9">${order.get(node.id)}</text>${lines.map((line, index) => `<text x="${x - 115}" y="${y + 43 + index * 14}" fill="#5f6981" font-family="Consolas,monospace" font-size="10">${escape(line)}</text>`).join('')}<text x="${x - 115}" y="${y + height - 11}" fill="#a0a8ba" font-size="9">≈ ${number(node.estimatedRows)} tuplas · ${node.width} atributos</text></g>`;
  }).join('');
  return `<div class="graph-stage"><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Grafo ${mode === 'optimized' ? 'otimizado' : 'original'}, fluxo de baixo para cima" style="min-width:${Math.max(314, leaf * 245 + 12)}px" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow-${mode}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#b7bdcf"/></marker></defs>${edgeMarkup}${nodeMarkup}</svg><div class="legend"><span><i></i>Projeção / junção</span><span><i class="teal"></i>Seleção</span><span><i class="blue"></i>Tabela</span><span>↑ Fluxo dos resultados · números = ordem de execução</span></div></div>`;
}
function renderGraph() {
  const mode = planMode === 'compare' ? 'optimized' : planMode;
  let content = heading('Estratégia de execução', 'Clique em um operador para inspecionar seu predicado e seus atributos.', modeControls(true));
  if (planMode === 'compare') {
    content += `<div class="comparison"><div><h3>Plano original</h3>${graphSvg(analysis.original, 'original')}</div><div><h3>Plano otimizado</h3>${graphSvg(analysis.optimized, 'optimized')}</div></div>`;
  } else {
    content += `<div class="graph-layout">${graphSvg(analysis[mode], mode)}<aside class="insights"><span class="badge">${mode === 'optimized' ? 'Heurísticas aplicadas' : 'Antes da otimização'}</span><h3 style="margin-top:17px">Menos dados, mais cedo.</h3><p>Estimativas orientam o plano; os resultados são medidos na execução.</p>${(analysis[mode].notes).map((note, index) => `<div class="insight"><span>${String(index + 1).padStart(2, '0')} · ${index === 0 ? 'Estratégia' : 'Transformação'}</span>${escape(note)}</div>`).join('')}</aside></div>`;
  }
  content += `<div id="node-details" class="node-details" hidden></div><div class="algebra"><h3>ÁLGEBRA RELACIONAL · ${mode === 'optimized' ? 'OTIMIZADA' : 'ORIGINAL'}</h3><code>${escape(analysis.algebra[mode])}</code></div><p class="note">π preserva duplicatas, como SELECT sem DISTINCT. Cardinalidades com ≈ são estimativas heurísticas; a aba Plano de execução mostra as contagens reais.</p>`;
  $('#panel').innerHTML = content;
  $('#panel').querySelectorAll('[data-node]').forEach(element => {
    function inspect() {
      const node = analysis[element.dataset.plan].order.find(node => node.id === element.dataset.node);
      const measured = analysis[element.dataset.plan + 'Result']?.trace.find(step => step.nodeId === node.id);
      $('#node-details').hidden = false;
      $('#node-details').innerHTML = `<strong>${node.symbol} ${node.name}</strong> · ${escape(node.label)}<br>Atributos: ${escape(node.columns.join(', ') || 'tupla vazia')}<br>${measured ? `${measured.rows} tuplas reais · ${measured.width} atributos` : 'Execução original não concluída'} · estimativa: ${number(node.estimatedRows)} tuplas.`;
    }
    element.addEventListener('click', inspect);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } });
  });
}
function renderExecution() {
  if (planMode === 'compare') planMode = 'optimized';
  const plan = analysis[planMode], result = analysis[planMode + 'Result'];
  const rows = plan.order.map((node, index) => {
    const step = result?.trace.find(step => step.nodeId === node.id);
    return `<tr><td><span class="step-number">${index + 1}</span></td><td>${node.symbol} ${node.name}</td><td><code>${escape(node.label)}</code></td><td>${step?.inputRows.join(' + ') || '—'}</td><td>${step ? number(step.rows) : '—'}</td><td>${node.width}</td><td>≈ ${number(node.estimatedRows)}</td></tr>`;
  }).join('');
  $('#panel').innerHTML = heading('Plano de execução', 'Percurso em pós-ordem: os filhos são executados antes do operador pai.', modeControls()) + `<div class="table-wrap"><table><thead><tr><th>Ordem</th><th>Operação</th><th>Tabela / expressão</th><th>Tuplas de entrada</th><th>Tuplas de saída</th><th>Atributos</th><th>Estimativa</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">${result ? `${number(result.work)} unidades de trabalho medidas (linhas visitadas / pares testados). ${number(result.cells)} células materializadas ao longo do plano.` : escape(analysis.originalError)}<br>Estimativas: igualdade × 0,10; desigualdade (&lt;&gt;) × 0,90; comparações de faixa × 0,33. Não são estatísticas de um SGBD.</p>`;
}
function renderResults() {
  const result = analysis.optimizedResult;
  $('#panel').innerHTML = heading('Resultado da consulta', 'Dados fictícios do BD_Vendas · consulta executada em memória.', '<button id="csv" class="button secondary">↓ Exportar CSV</button>') + `<p class="result-info"><span class="badge">${number(result.rows.length)} ${result.rows.length === 1 ? 'tupla' : 'tuplas'} · ${result.columns.length} atributos</span>${analysis.verified ? '<span>✓ Mesmo resultado nos dois planos</span>' : '<span>Plano original excedeu o limite; equivalência não verificada</span>'}</p><div class="table-wrap"><table><thead><tr>${result.columns.map(column => `<th>${escape(column)}</th>`).join('')}</tr></thead><tbody>${result.rows.length ? result.rows.map(row => `<tr>${row.map(value => `<td>${value === null ? '<span class="null">NULL</span>' : escape(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${result.columns.length}" class="empty">Nenhuma tupla satisfaz os predicados.</td></tr>`}</tbody></table></div><p class="note">A ordem das tuplas pode mudar entre os planos; ORDER BY não faz parte do subconjunto suportado. Comparações com NULL não passam pelo filtro.</p>`;
  $('#csv').addEventListener('click', () => {
    const cell = value => {
      let text = value === null ? '' : String(value);
      // Mantém textos de células como dados ao abrir o CSV em uma planilha.
      if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    download('resultado-consulta.csv', '\uFEFF' + [result.columns, ...result.rows].map(row => row.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  });
}
function renderParser() {
  const query = analysis.query;
  const predicates = query.predicateLabels;
  $('#panel').innerHTML = heading('Componentes da consulta', 'Tokens, referências resolvidas e predicados após a validação semântica.') + `<div class="parser-grid"><div class="detail-card"><h3>Estrutura validada</h3><dl><div><dt>SELECT · projeção</dt><dd>${escape(query.columns.map(column => column.key).join(', '))}</dd></div><div><dt>FROM · relações</dt><dd>${escape(query.tables.map(table => table.table + ' AS ' + table.alias).join(', '))}</dd></div><div><dt>ON / WHERE · predicados</dt><dd>${escape(predicates.join(' AND ') || 'Sem predicados')}</dd></div><div><dt>VALIDAÇÃO</dt><dd>✓ Tabelas existentes · campos resolvidos · aliases únicos · escopo das junções</dd></div></dl></div><div class="detail-card"><h3>Análise léxica · ${query.tokens.length} tokens</h3><div class="token-list">${query.tokens.map(token => `<span class="token" title="${escape(token.type)} · posição ${token.position + 1}">${escape(token.type === 'string' ? "'" + token.value + "'" : (token.raw ?? token.value))}</span>`).join('')}</div></div></div><p class="note">Aceita SELECT, FROM, INNER JOIN … ON, WHERE, AND, aliases, *, parênteses, comentários de linha e =, &gt;, &lt;, &lt;=, &gt;=, &lt;&gt;. Nomes ignoram diferenças entre maiúsculas e minúsculas. Textos usam aspas simples; números usam ponto decimal. Não aceita funções, OR, agregação, subconsultas ou comandos de alteração.</p>`;
}
function renderSchema() {
  $('#panel').innerHTML = heading('Catálogo BD_Vendas', 'As dez tabelas do enunciado, usadas para validar todas as referências da consulta.') + `<div class="schema-grid">${Object.entries(schema).map(([table, columns]) => `<article id="schema-${table}" class="schema-card ${selectedTable === table ? 'selected' : ''}"><h3>${table}<small>${sampleCounts[table]} registros</small></h3><ul>${columns.map(column => `<li>${column}</li>`).join('')}</ul></article>`).join('')}</div><p class="note">Os registros são exemplos fictícios para demonstração. A aplicação não exige conexão com MySQL; o script opcional de criação está em sql/bd-vendas.sql.</p>`;
}
function renderDeliveries() {
  const deliveries = [
    ['15/10/2026', 'Interface gráfica existente e funcional', 'Editor SQL, exemplos, navegação e exportação'],
    ['15/10/2026', 'A string é parseada', 'Lexer e parser com estrutura da consulta e tokens'],
    ['15/10/2026', 'Campos e comandos errados são validados', 'Erros de sintaxe, tabelas, campos, ambiguidade e escopo'],
    ['20/10/2026', 'Conversão para álgebra relacional', 'Expressões de seleção, projeção, junção e produto'],
    ['20/10/2026', 'Grafo não otimizado', 'Plano original com fluxo e ordem de execução'],
    ['22/10/2026', 'Heurísticas de projeção e seleção', 'Filtros e redução de atributos próximos às tabelas'],
    ['27/10/2026', 'Demais heurísticas', 'Seletividade, reordenação e conversão de produto em junção'],
  ];
  $('#panel').innerHTML = heading('Cronograma de entregas', 'Prazos fornecidos em Entregáveis.pdf · penalidade indicada: −1 por item.') + `<div class="table-wrap"><table><thead><tr><th>Entrega</th><th>Requisito</th><th>Implementação disponível</th><th>Situação</th></tr></thead><tbody>${deliveries.map(([date, title, description]) => `<tr><td class="delivery-date">${date}</td><td>${title}</td><td>${description}</td><td><span class="badge">Implementado</span></td></tr>`).join('')}</tbody></table></div><p class="note">“Implementado” indica disponibilidade no projeto local. A apresentação e a entrega à disciplina são realizadas pela equipe.</p>`;
}

async function initialize() {
  $('#run').disabled = true;
  $('#status').textContent = 'Conectando ao servidor Python…';
  try {
    const catalog = await requestJson('/api/catalog');
    ({ schema, sampleCounts, examples } = catalog);
    $('#example').innerHTML = '<option value="">Escolha um exemplo</option>' + examples.map((example, index) => `<option value="${index}">${escape(example.name)}</option>`).join('');
    $('#table-nav').innerHTML = Object.keys(schema).map(table => `<button data-table="${table}"><span>▤</span>${table}<small>${schema[table].length}</small></button>`).join('');
    $('#sql').value = examples[1].sql;
    $('#example').value = '1';
    await run();
  } catch (error) {
    $('#status').textContent = 'Servidor Python indisponível.';
    $('#error').hidden = false;
    $('#error').innerHTML = `<strong>Não foi possível carregar o projeto</strong>${escape(error.message)}`;
  }
}
initialize();
