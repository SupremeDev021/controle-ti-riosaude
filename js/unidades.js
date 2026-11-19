import { api } from './api.js';
import { displayAt, displayDate, empty, escape, formData, hasOccurrence, heading, minuteDate, minuteTime,
  monthName, navigate, occurrence, operations, options, periodLabel, shiftTime, stepMonth, today, units } from './utils.js';

const unitField = (value, all = false) => '<label>Unidade<select name="unit">' + (all ? '<option value="">Todas as unidades</option>' : '')
  + options(units, value) + '</select></label>';
const kinds = ['Previsto','Substituição','Saída antecipada','Ausência','Sem cobertura informada','Chegada confirmada'];
const qs = (data) => new URLSearchParams(data).toString();
const classes = { 'Previsto': 'active', 'Substituição': 'substitution', 'Saída antecipada': 'uncovered', 'Ausência': 'absent',
  'Sem cobertura informada': 'uncovered', 'Chegada confirmada': 'active' };

function validUnit(value) { return units.includes(value) ? value : units[0]; }
function validDay(value) { return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value || '') ? value : today(); }
function validMonth(value) { return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value || '') ? value : today().slice(0,7); }
function daysIn(month) { return new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).getUTCDate(); }
function monthEnd(month) { return month + '-' + daysIn(month); }
function details(row) {
  const parts = [];
  if (row.type === 'coverageGap') parts.push(row.reason + (row.notes ? ' · ' + row.notes : ''));
  if (row.arrival) parts.push('Chegada confirmada em ' + displayAt(row.arrival));
  if (row.exit) parts.push('Saída antecipada às ' + row.exit + ' · ' + row.reason + (row.notes ? ' · ' + row.notes : ''));
  if (row.absent) parts.push('Ausência informada' + (row.reason ? ' · ' + row.reason : '') + (row.notes ? ' · ' + row.notes : ''));
  row.subs.forEach(sub => parts.push(sub.name + ' · ' + shiftTime(sub) + ' · ' + sub.reason
    + (sub.arrival ? ' · chegada confirmada em ' + displayAt(sub.arrival) : ' · chegada aguardando confirmação')
    + (sub.notes ? ' · ' + sub.notes : '')));
  return parts.map(escape).join('<br>') || '—';
}

function shiftTable(rows) {
  if (!rows.length) return empty('Nenhum plantão para os filtros selecionados.');
  return '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Técnico previsto</th><th>Horário</th><th>Situação</th><th>Ocorrências</th></tr></thead><tbody>'
    + rows.map(row => '<tr><td>' + displayDate(row.date) + '</td><td>' + escape(row.type === 'coverageGap' ? 'Unidade sem cobertura' : row.tech) + '</td><td>' + shiftTime(row)
      + '</td><td><span class="status ' + classes[occurrence(row)] + '">' + occurrence(row) + '</span></td><td>' + details(row) + '</td></tr>').join('')
    + '</tbody></table></div>';
}

export function renderUnit(root, params) {
  const unit = validUnit(params.get('unit'));
  const date = validDay(params.get('date'));
  const from = params.has('from') ? validDay(params.get('from')) : date.slice(0, 7) + '-01';
  const to = params.has('to') ? validDay(params.get('to')) : monthEnd(date.slice(0, 7));
  const tech = params.get('tech') || '';
  const kind = params.get('kind') || '';
  root.innerHTML = heading(escape(unit), 'Escala, ocorrências e intervalos de cobertura da unidade.',
    '<a class="button secondary" href="#historico?' + qs({ unit }) + '">Histórico da unidade</a>')
    + '<form class="surface filters">' + unitField(unit) + '<label>Data de referência<input name="date" type="date" required value="' + date
    + '"></label><label>De<input name="from" type="date" required value="' + from
    + '"></label><label>Até<input name="to" type="date" required value="' + to
    + '"></label><label>Técnico<input name="tech" value="' + escape(tech) + '" placeholder="Nome do técnico"></label>'
    + '<label>Ocorrência<select name="kind"><option value="">Todas</option>' + options(kinds, kind)
    + '</select></label><button class="button secondary">Filtrar</button></form><div id="unit-data"></div>';
  const form = root.querySelector('form');
  form.elements.date.onchange = () => {
    if (!form.elements.date.value) return;
    const month = form.elements.date.value.slice(0,7);
    form.elements.from.value = month + '-01';
    form.elements.to.value = monthEnd(month);
  };
  form.onsubmit = event => { event.preventDefault(); navigate('unidade', formData(form)); };
  const data = root.querySelector('#unit-data');
  data.innerHTML = empty('Consultando a unidade…');
  const matches = row => (!tech || [row.tech, ...row.subs.map(sub => sub.name)].some(name =>
    name.toLocaleLowerCase('pt-BR').includes(tech.trim().toLocaleLowerCase('pt-BR')))) && hasOccurrence(row, kind);
  api('unitDetail', { unit, date, from, to }).then(({ daily, rows }) => {
    const next = daily.next;
    const gaps = daily.gaps.map(gap => periodLabel(gap.from, gap.to)).join(' · ');
    data.innerHTML = '<div class="unit-summary"><article class="surface"><h2>Intervalos sem cobertura</h2><p>'
      + (daily.today.length || daily.reports?.length ? (gaps || 'Cobertura informada ao longo do dia.') : 'Sem escala cadastrada para esta data.')
      + '</p></article><article class="surface"><h2>Próxima entrada</h2><p>'
      + (next ? escape(next.name) + ' · ' + displayDate(minuteDate(next.from)) + ' às ' + minuteTime(next.from) : 'Sem próximo plantão informado.')
      + '</p></article></div><section class="surface stacked"><div class="section-heading"><h2>Escala do dia · ' + displayDate(date) + '</h2>'
      + '<div class="actions">'
      + (daily.awaiting?.length ? '<a class="button primary" href="#chegada?' + qs({ unit, date }) + '">Confirmar Chegada</a>' : '')
      + '<a class="button secondary" href="#cobertura?' + qs({ unit, date }) + '">Informar Sem Cobertura</a>'
      + '<a class="button secondary" href="#escala?' + qs({ unit, date, month: date.slice(0,7) }) + '">Editar plantões</a></div></div>'
      + shiftTable([...daily.today, ...(daily.reports || [])].filter(matches)) + '</section><section class="surface stacked"><div class="section-heading"><h2>Escala do período</h2>'
      + '<a class="button secondary" href="#calendario?' + qs({ unit, month: date.slice(0,7) }) + '">Ver calendário</a></div>'
      + shiftTable(rows.filter(matches)) + '</section>';
  }).catch(error => { data.innerHTML = empty(error.message); });
}

export function renderCalendar(root, params) {
  const unit = validUnit(params.get('unit'));
  const month = validMonth(params.get('month'));
  root.innerHTML = heading('Calendário mensal', 'Selecione um dia para consultar ou editar os plantões.')
    + '<form class="surface filters">' + unitField(unit) + '<label>Mês e ano<input name="month" type="month" required value="' + month
    + '"></label><button class="button secondary">Consultar</button></form><section class="surface" id="calendar-data"></section>';
  const form = root.querySelector('form');
  form.onsubmit = event => { event.preventDefault(); navigate('calendario', formData(form)); };
  const content = root.querySelector('#calendar-data');
  content.innerHTML = empty('Consultando o calendário…');
  api('unitDetail', { unit, date: month + '-01', from: month + '-01', to: monthEnd(month) }).then(({ rows }) => {
    const todayDate = today();
    const offset = new Date(month + '-01T00:00:00Z').getUTCDay();
    const days = Array.from({ length: daysIn(month) }, (_, index) => {
      const date = month + '-' + String(index + 1).padStart(2, '0');
      const previous = new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0,10);
      const shifts = rows.filter(row => row.date === date || (row.date === previous && row.end <= row.start && row.end !== '00:00'));
      return '<a class="calendar-day ' + (date === todayDate ? 'is-today' : '') + '" href="#unidade?' + qs({ unit, date }) + '">'
        + '<strong><span class="day-week">' + ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][(offset + index) % 7] + ' </span>' + (index + 1) + '</strong>'
        + (shifts.length ? shifts.map(row => '<span class="calendar-shift ' + classes[occurrence(row)] + '"><span>' + escape(row.type === 'coverageGap' ? 'Sem cobertura informada' : row.tech)
          + '</span><small>' + shiftTime(row) + (row.date !== date ? ' · iniciado na véspera' : '') + '</small></span>').join('')
          : '<span class="day-empty">Sem escala</span>') + '</a>';
    }).join('');
    content.innerHTML = '<div class="section-heading"><h2 class="month-label">' + monthName(month) + '</h2><div class="actions">'
      + '<a class="button secondary" href="#calendario?' + qs({ unit, month: stepMonth(month, -1) }) + '" aria-label="Mês anterior">‹</a>'
      + '<a class="button secondary" href="#calendario?' + qs({ unit, month: stepMonth(month, 1) }) + '" aria-label="Próximo mês">›</a></div></div>'
      + '<div class="legend">' + [...kinds, 'Sem escala'].map(kind => '<span class="status ' + (classes[kind] || 'empty') + '">' + kind + '</span>').join('') + '</div>'
      + '<div class="calendar-grid">' + ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => '<div class="weekday">' + day + '</div>').join('')
      + '<div class="calendar-spacer"></div>'.repeat(offset) + days + '</div>';
  }).catch(error => { content.innerHTML = empty(error.message); });
}

export function renderHistory(root, params) {
  const unit = params.get('unit') || '';
  const date = params.get('date') || '';
  const operation = params.get('operation') || '';
  const page = Number(params.get('page')) || 1;
  root.innerHTML = heading('Histórico', 'Consulte as operações registradas no Google Sheets.')
    + '<form class="surface filters">' + unitField(unit, true) + '<label>Data da operação<input type="date" name="date" value="' + escape(date)
    + '"></label><label>Operação<select name="operation"><option value="">Todas</option>' + options(operations, operation)
    + '</select></label><button class="button secondary">Filtrar</button></form><section class="surface" id="history-data"></section>';
  const form = root.querySelector('form');
  form.onsubmit = event => { event.preventDefault(); navigate('historico', formData(form)); };
  const content = root.querySelector('#history-data');
  content.innerHTML = empty('Consultando o histórico…');
  api('history', { unit, date, operation, page }).then(data => {
    const pages = Math.max(1, Math.ceil(data.total / 30));
    const link = next => '#historico?' + qs({ unit, date, operation, page: next });
    const snapshot = row => row ? escape((row.type === 'coverageGap' ? 'Unidade sem cobertura' : row.tech) + ' · ' + displayDate(row.date) + ' · ' + shiftTime(row)
      + (row.deleted ? ' · desativado' : '')) + '<br>' + details(row)
      + (row.correction ? '<br>Justificativa · ' + escape(row.correction) : '') : '—';
    content.innerHTML = '<div class="section-heading"><h2>Operações registradas</h2><span class="help">' + data.total + ' registro(s)</span></div>'
      + (data.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Unidade</th><th>Técnico</th>'
        + '<th>Ocorrência</th><th>Detalhes</th></tr></thead><tbody>' + data.rows.map(row => '<tr><td>' + displayAt(row.at)
          + '</td><td>' + escape(row.unit) + '</td><td>' + escape((row.after || row.before)?.tech)
          + '</td><td>' + escape(row.operation) + '</td><td><details><summary>Ver alteração</summary><p><strong>Antes</strong><br>'
          + snapshot(row.before) + '</p><p><strong>Depois</strong><br>' + snapshot(row.after) + '</p></details></td></tr>').join('')
        + '</tbody></table></div>' : empty('Nenhuma operação para os filtros selecionados.'))
      + '<div class="form-footer pagination">' + (page > 1 ? '<a class="button secondary" href="' + link(page - 1) + '">Anterior</a>' : '')
      + '<span>Página ' + page + ' de ' + pages + '</span>' + (page < pages ? '<a class="button secondary" href="' + link(page + 1) + '">Próxima</a>' : '') + '</div>';
  }).catch(error => { content.innerHTML = empty(error.message); });
}
