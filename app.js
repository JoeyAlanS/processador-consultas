const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
let schema = {}, sampleCounts = {}, examples = [], requestSequence = 0;
let analysis = null, activeTab = 'graph', selectedTable = null;

$('#table-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-table]');
  if (!button) return;
  selectedTable = button.dataset.table; switchTab('schema');
  document.getElementById(`schema-${selectedTable}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

async function requestJson(url, options = {}) {
  let response;
  try { response = await fetch(url, options); }
  catch { throw new Error('Não foi possível acessar o servidor Python. Inicie o projeto com iniciar.cmd ou python server.py.'); }
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Falha ao acessar o servidor Python.'), payload.error);
  return payload;
}

async function run() {
  const request = ++requestSequence;
  const sql = $('#sql').value;
  $('#error').hidden = true;
  $('#status').classList.remove('pending');
  $('#status').textContent = 'Processando consulta no servidor Python…';
  $('#run').disabled = true;
  $('#run').textContent = 'Processando…';
  try {
    const result = await requestJson('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) });
    if (request !== requestSequence) return;
    analysis = result;
    $('#status').textContent = '✓ Consulta válida · álgebra relacional e grafo original construídos.';
    const changed = $('#sql').value !== sql;
    if (changed) {
      $('#status').classList.add('pending');
      $('#status').textContent = 'Consulta alterada · clique em Processar para atualizar a análise abaixo.';
    }
    renderMetrics(); renderPanel();
  } catch (error) {
    if (request !== requestSequence) return;
    analysis = null;
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
});
$('#example').addEventListener('change', event => {
  if (event.target.value === '') return;
  $('#sql').value = examples[Number(event.target.value)].sql; run();
});
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
  const metrics = [
    ['Tabelas consultadas', analysis.query.tables.length, '', 'Referências resolvidas no catálogo'],
    ['Operações no grafo', analysis.original.order.length, '', 'Plano original, sem heurísticas'],
    ['Atributos de saída', analysis.original.root.width, '', 'Campos solicitados no SELECT'],
    ['Predicados', analysis.query.predicateLabels.length, '', 'Condições de ON e WHERE'],
  ];
  $('#metrics').innerHTML = metrics.map(([label, value, change, description]) => `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">${number(value)}<small>${change}</small></span><span class="metric-foot">${description}</span></div>`).join('');
}
function heading(title, subtitle, controls = '') {
  return `<div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${controls}</div>`;
}

function renderPanel() {
  if (activeTab === 'schema') return renderSchema();
  if (!analysis) { $('#panel').innerHTML = '<div class="empty">Insira uma consulta válida para explorar sua análise.</div>'; return; }
  if (activeTab === 'graph') renderGraph();
  else if (activeTab === 'parser') renderParser();
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
  const plan = analysis.original;
  $('#panel').innerHTML = heading('Grafo não otimizado', 'As tabelas seguem a ordem do SQL; o WHERE é aplicado depois das combinações.') + graphSvg(plan, 'original') + `<div id="node-details" class="node-details" hidden></div><div class="algebra"><h3>ÁLGEBRA RELACIONAL · ORIGINAL</h3><code>${escape(analysis.algebra.original)}</code></div><p class="note">As setas mostram o fluxo das relações. Os números indicam a dependência entre operadores; ≈ representa uma estimativa didática. Esta etapa constrói o plano e não executa registros.</p>`;
  $('#panel').querySelectorAll('[data-node]').forEach(element => {
    function inspect() {
      const node = plan.order.find(node => node.id === element.dataset.node);
      $('#node-details').hidden = false;
      $('#node-details').innerHTML = `<strong>${node.symbol} ${node.name}</strong> · ${escape(node.label)}<br>Atributos: ${escape(node.columns.join(', '))}<br>Estimativa: ${number(node.estimatedRows)} tuplas.`;
    }
    element.addEventListener('click', inspect);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } });
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
