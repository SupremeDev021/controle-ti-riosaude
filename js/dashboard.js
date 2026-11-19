import { api, configured } from './api.js';
import { coverageDisplay, nextCoverageRefresh } from './status-cobertura.js';
import { fitTv, tvCard } from './tv.js';
import { displayAt, empty, escape, heading, icon, minuteDate, minuteTime, periodLabel, shiftTime, units } from './utils.js';

let snapshot;
let pending;
let boundaryTimer;
let tvObserver;

export async function syncDashboard(force = false) {
  if (!configured) return Promise.resolve();
  if (force && pending) await pending.catch(() => {});
  if (!pending) pending = api('dashboard').then(data => { snapshot = data; }).finally(() => { pending = null; });
  return pending;
}

export function renderDashboard(root, { tv = false, notify = () => {} } = {}) {
  clearTimeout(boundaryTimer);
  tvObserver?.disconnect();
  root.innerHTML = (tv ? '<div class="tv-heading"><div><h1>RioSaúde · Cobertura de TI</h1><p>Cobertura informada · Brasília</p></div>'
    + '<div class="actions"><button class="button secondary" data-fullscreen>Tela cheia</button><a class="button secondary" href="#dashboard" data-exit-tv>Sair do Modo TV</a></div></div>'
    : heading('Dashboard geral', 'Gerenciamento de Escalas e Cobertura das Unidades',
      '<div class="actions"><a class="button primary" href="#tv">MODO TV</a><button id="refresh" class="button secondary">' + icon('refresh') + ' Atualizar</button></div>')
    + '<div class="quick-links"><span>Ações rápidas</span><a href="#escala">' + icon('escala') + ' Alterar escala</a>'
    + '<a href="#saida">' + icon('saida') + ' Informar saída</a><a href="#troca">' + icon('troca') + ' Informar troca</a>'
    + '<a href="#cobertura">' + icon('warning') + ' Informar sem cobertura</a></div>')
    + '<div id="dashboard-content"></div>';
  const button = root.querySelector('#refresh') || document.createElement('button');
  const content = root.querySelector('#dashboard-content');
  if (tv) {
    const fullscreen = root.querySelector('[data-fullscreen]');
    fullscreen.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        fullscreen.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
      } catch (error) { notify('Use o botão de tela cheia do navegador. ' + error.message, 'error'); }
    };
    root.querySelector('[data-exit-tv]').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(error => console.error(error));
    };
    tvObserver = new ResizeObserver(() => fitTv(root, units.length));
    tvObserver.observe(root);
  }
  function paint(state, error = '') {
    content.innerHTML = dashboardMarkup(snapshot, state, error, tv);
    if (tv) requestAnimationFrame(() => fitTv(root, units.length));
  }
  async function refresh(force = false) {
    if (button.disabled || !root.contains(content)) return;
    clearTimeout(boundaryTimer);
    button.disabled = true;
    paint(configured ? 'loading' : 'unconfigured');
    let succeeded = false;
    try { await syncDashboard(force === true); paint(configured ? 'ready' : 'unconfigured'); succeeded = true; }
    catch (error) { paint('error', error.message); }
    finally {
      button.disabled = false;
      const delay = succeeded ? nextCoverageRefresh(snapshot) : null;
      if (delay !== null && root.contains(content)) boundaryTimer = setTimeout(() => refresh(), delay);
    }
  }
  button.onclick = () => refresh();
  refresh();
  return refresh;
}

function dashboardMarkup(data, state, error, tv = false) {
  const priority = { uncovered: 0, waiting: 1, empty: 2, substitution: 3, active: 4, unknown: 5 };
  const rows = units.map(unit => data?.units.find(row => row.unit === unit) || { unit, status: 'unknown' })
    .sort((a, b) => priority[a.status] - priority[b.status]);
  const ready = Boolean(data);
  const sum = (pick) => ready ? rows.reduce((total, row) => total + pick(row), 0) : '—';
  const metrics = [
    [units.length,'Unidades monitoradas','building','blue'],
    [sum(row => Number(row.active?.length > 0)),'Com cobertura','check','green'],
    [sum(row => Number(['uncovered','waiting'].includes(row.status))),'Sem cobertura atual','warning','red'],
    [sum(row => new Set((row.active || []).map(worker => worker.name.toLocaleLowerCase('pt-BR'))).size),'Técnicos em serviço','people','blue'],
    [sum(row => row.substitutions?.length || 0),'Substituições do dia','troca','amber'],
    [sum(row => row.exits?.length || 0),'Saídas antecipadas','saida','red'],
    [sum(row => Number(row.today?.length === 0)),'Unidades sem escala hoje','calendario','gray']
  ];
  const message = state === 'unconfigured' ? 'Conecte o Google Sheets para consultar a cobertura e registrar plantões.'
    : state === 'error' ? error + (data ? ' Exibindo a última consulta confirmada.' : '')
      : state === 'loading' && !data ? 'Consultando o Google Sheets…' : '';
  if (tv) return '<p class="tv-sync" role="status">' + escape(message || (data ? 'Última consulta · ' + displayAt(data.now) : 'Aguardando consulta'))
    + '</p><div class="tv-grid">' + rows.map(tvCard).join('') + '</div>';
  const alerts = ready ? rows.flatMap((row, index) => {
    const result = [];
    if (row.status === 'uncovered' || row.status === 'waiting') result.push({ index, priority: 0, unit: row.unit,
      text: coverageDisplay(row).expected ? 'SEM COBERTURA DE TI. AGUARDANDO CHEGADA DA COBERTURA · '
        + coverageDisplay(row).expected.name + ' · entrada prevista em ' + displayAt(minuteDate(coverageDisplay(row).expected.from) + 'T' + minuteTime(coverageDisplay(row).expected.from)) + '.'
        : row.activeReports?.length ? 'SEM COBERTURA DE TI. ' + row.activeReports.map(report => report.reason).join(' · ')
        : 'Nenhum técnico possui cobertura informada para o horário atual.' });
    (row.exits || []).forEach(shift => {
      if (!shift.subs.length) result.push({ index, priority: 1, unit: row.unit,
        text: shift.tech + ' · saída antecipada às ' + shift.exit + '. Sem substituto informado para o plantão.' });
    });
    (row.substitutions || []).forEach(sub => result.push({ index, priority: 2, unit: row.unit,
      text: sub.name + ' · substituição das ' + periodLabel(sub.from, sub.to) + '.' }));
    return result;
  }).sort((a, b) => a.priority - b.priority || a.index - b.index) : [];
  return (message ? '<div class="banner ' + (state === 'error' ? 'error' : '') + '" role="status">' + escape(message) + '</div>' : '')
    + '<div class="metrics">' + metrics.map(([value,label,glyph,tone]) => '<article class="metric">'
      + '<span class="stat-icon ' + tone + '">' + icon(glyph) + '</span><strong>' + value + '</strong><span>' + label + '</span></article>').join('') + '</div>'
    + '<section class="dashboard-section"><div class="section-heading"><div><h2>Cobertura informada</h2>'
    + '<p>Selecione uma unidade para consultar plantões e ocorrências.</p></div>'
    + '<span class="sync">' + (ready ? 'Última consulta em ' + displayAt(data.now) : 'Aguardando consulta') + '</span></div>'
    + '<div class="units">' + rows.map(row => unitCard(row, data?.now)).join('') + '</div></section>'
    + '<section class="surface alert-section"><div class="section-heading"><h2>Alertas operacionais</h2></div>'
    + (alerts.length ? '<ul class="alerts">' + alerts.map(item => '<li class="alert p' + item.priority + '">'
      + icon(item.priority === 2 ? 'troca' : 'warning') + '<div><strong>' + escape(item.unit) + '</strong><p>' + escape(item.text) + '</p></div></li>').join('') + '</ul>'
      : empty(ready ? 'Nenhum alerta operacional na última consulta.' : 'Os alertas aparecem após a consulta à planilha.')) + '</section>';
}

function unitCard(row, now) {
  const display = coverageDisplay(row);
  const href = '#unidade?' + new URLSearchParams({ unit: row.unit });
  const planned = row.planned?.length ? row.planned : row.today || [];
  const active = row.active || [];
  const currentGap = row.gap && row.planned?.length ? { from: row.gap.from,
    to: Math.min(row.gap.to, Math.max(...row.planned.map(item => item.to))) } : row.gap;
  const next = row.next && (escape(row.next.name) + ' · ' + minuteTime(row.next.from)
    + (minuteDate(row.next.from) !== now.slice(0, 10) ? ' · ' + minuteDate(row.next.from).slice(5).split('-').reverse().join('/') : ''));
  return '<article class="unit-card ' + display.status + '"><a class="unit-link" href="' + href + '">'
    + '<div class="unit-title"><span class="unit-icon">' + icon('building') + '</span><h3>' + escape(row.unit) + '</h3>' + icon('arrow') + '</div>'
    + '<span class="status ' + display.status + '">' + display.label + '</span></a>'
    + (display.expected ? '<p class="waiting-coverage">Cobertura prevista · ' + escape(display.expected.name)
      + '<br>Chegada prevista · ' + displayAt(minuteDate(display.expected.from) + 'T' + minuteTime(display.expected.from)) + '</p>' : '')
    + '<dl><dt>Em serviço</dt><dd>' + (active.length ? active.map(item => escape(item.name) + ' · ' + periodLabel(item.from, item.to)
      + (item.substitute ? ' (substituto de ' + escape(item.original) + ')' : '')).join('<br>') : '—') + '</dd>'
    + '<dt>Previsto</dt><dd>' + (planned.length ? planned.map(item => escape(item.tech) + ' · ' + shiftTime(item)).join('<br>') : '—') + '</dd>'
    + '<dt>Próxima entrada</dt><dd>' + (next || '—') + '</dd>'
    + (row.activeReports?.length ? '<dt>Falta de cobertura</dt><dd>' + row.activeReports.map(report =>
      escape(report.reason) + ' · ' + periodLabel(report.from, report.to)).join('<br>') + '</dd>' : '')
    + (row.exits?.length ? '<dt>Saída antecipada</dt><dd>' + row.exits.map(item => escape(item.tech) + ' · ' + item.exit).join('<br>') + '</dd>' : '')
    + (row.substitutions?.length ? '<dt>Substituição</dt><dd>' + row.substitutions.map(item =>
      escape(item.name) + ' · ' + periodLabel(item.from, item.to) + '<br><span class="help">' + escape(item.reason) + '</span>').join('<br>') + '</dd>' : '')
    + (currentGap ? '<dt>Período descoberto</dt><dd>' + periodLabel(currentGap.from, currentGap.to) + '</dd>' : '')
    + '</dl><div class="unit-actions">'
    + (row.awaiting?.length ? '<a class="button secondary" href="#chegada?' + new URLSearchParams({ unit: row.unit, date: now.slice(0,10) })
      + '">Confirmar Chegada</a>' : '')
    + '<a class="button secondary" href="#cobertura?' + new URLSearchParams({ unit: row.unit }) + '">Informar Sem Cobertura</a></div>'
    + '<p class="unit-updated">Última atualização · ' + displayAt(row.updated) + '</p></article>';
}
