import { renderDashboard, syncDashboard } from './dashboard.js';
import { renderScale } from './escala.js';
import { renderOccurrence } from './ocorrencias.js';
import { renderCoverageReport } from './cobertura.js';
import { renderArrival } from './chegadas.js';
import { api } from './api.js';
import { renderCalendar, renderHistory, renderUnit } from './unidades.js';
import { icon, units, zone } from './utils.js';

const names = { dashboard: 'Dashboard Geral', escala: 'Alterar Escala', saida: 'Informar Saída',
  troca: 'Informar Troca', chegada: 'Confirmar Chegada', cobertura: 'Informar Sem Cobertura', calendario: 'Calendário', historico: 'Histórico' };
const nav = document.querySelector('#navigation');
const view = document.querySelector('#view');
const notice = document.querySelector('#notice');
const sidebar = document.querySelector('#sidebar');
const menu = document.querySelector('#menu');
let route;
let refresh;
let noticeTimeout;

function notify(message, kind = 'success') {
  notice.hidden = false;
  notice.className = 'banner ' + kind;
  notice.textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.hidden = true; }, 10000);
}
function setMenu(open) {
  sidebar.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}
menu.onclick = () => setMenu(!sidebar.classList.contains('open'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && sidebar.classList.contains('open')) { setMenu(false); menu.focus(); }
});

function draw() {
  const [requested, query] = location.hash.slice(1).split('?');
  if (requested === 'main') return;
  route = Object.hasOwn(names, requested) || ['unidade','tv'].includes(requested) ? requested : 'dashboard';
  document.body.classList.toggle('tv-mode', route === 'tv');
  const params = new URLSearchParams(query);
  nav.innerHTML = '<p>PAINEL OPERACIONAL</p>' + Object.entries(names).map(([key,label]) =>
    '<a href="#' + key + '"' + (route === key || (route === 'unidade' && key === 'dashboard') ? ' aria-current="page"' : '')
    + '>' + icon(key) + label + '</a>').join('');
  notice.hidden = true;
  setMenu(false);
  refresh = null;
  if (route === 'dashboard') refresh = renderDashboard(view);
  if (route === 'tv') refresh = renderDashboard(view, { tv: true, notify });
  if (route === 'escala') renderScale(view, params, notify);
  if (route === 'saida' || route === 'troca') renderOccurrence(view, params, notify, route);
  if (route === 'cobertura') renderCoverageReport(view, params, notify);
  if (route === 'chegada') renderArrival(view, params, notify);
  if (route === 'calendario') renderCalendar(view, params);
  if (route === 'unidade') renderUnit(view, params);
  if (route === 'historico') renderHistory(view, params);
  window.scrollTo(0, 0);
  document.querySelector('#main').focus({ preventScroll: true });
}

const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' });
const clock = document.querySelector('#clock');
function showTime() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = formatter.format(now) + ' · Brasília';
}
function refreshPanel(event) {
  const force = event?.type === 'schedule-saved';
  if (refresh) refresh(force);
  else syncDashboard(force).catch(error => {
    notify('Dados salvos. A consulta do dashboard falhou. ' + error.message, 'error');
  });
}
window.addEventListener('hashchange', draw);
window.addEventListener('schedule-saved', refreshPanel);
setInterval(() => { if (route === 'dashboard' || route === 'tv') refreshPanel(); }, 60000);
setInterval(showTime, 15000);
showTime();
view.innerHTML = '<div class="empty">Consultando o cadastro de unidades…</div>';
api('units').then(catalog => {
  if (!Array.isArray(catalog) || !catalog.length || !catalog.every(unit => typeof unit === 'string')) throw new Error('Cadastro de unidades inválido.');
  units.splice(0, units.length, ...catalog);
  draw();
}).catch(error => { draw(); notify(error.message, 'error'); });
