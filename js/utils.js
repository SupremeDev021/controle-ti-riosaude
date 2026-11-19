export const units = ['CER BARRA', 'UPA CIDADE DE DEUS', 'UPA COSTA BARROS', 'UPA DEL CASTILHO',
  'UPA ENGENHO DE DENTRO', 'UPA JOAO XXIII', 'UPA MADUREIRA', 'UPA MAGALHAES BASTOS',
  'UPA PACIÊNCIA', 'UPA ROCHA MIRANDA', 'UPA SENADOR CAMARA', 'UPA SEPETIBA', 'UPA VILA KENNEDY',
  'MATERNIDADE ROCINHA'];
export const operations = ['Cadastro','Alteração','Exclusão lógica','Saída antecipada','Substituição','Ausência',
  'Correção de saída','Cancelamento de saída','Correção de substituição','Cancelamento de substituição',
  'Unidade sem cobertura','Cancelamento de falta de cobertura','Chegada confirmada','Correção de chegada','Cancelamento de chegada'];
export const zone = 'America/Sao_Paulo';
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date());
export const displayDate = (date) => date ? date.slice(0, 10).split('-').reverse().join('/') : '';
export const displayAt = (value) => value ? displayDate(value) + ' às ' + value.slice(11, 16) : '—';
export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));
export const options = (values, selected = '') => values.map(value =>
  '<option' + (value === selected ? ' selected' : '') + '>' + escape(value) + '</option>').join('');
export const formData = (form) => Object.fromEntries(new FormData(form));
export function navigate(page, fields) {
  const hash = '#' + page + '?' + new URLSearchParams(fields);
  if (location.hash === hash) window.dispatchEvent(new Event('hashchange'));
  else location.hash = hash;
}
export const shiftTime = (row) => row.start + ' – ' + row.end + (row.end <= row.start ? ' (+1 dia)' : '');
export const minuteTime = (minute) => new Date(minute * 60000).toISOString().slice(11, 16);
export const minuteDate = (minute) => new Date(minute * 60000).toISOString().slice(0, 10);
export function periodLabel(from, to) {
  return minuteTime(from) + ' – ' + minuteTime(to) + (minuteDate(from) !== minuteDate(to) ? ' (+1 dia)' : '');
}
export function stepMonth(month, step) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + step, 1)).toISOString().slice(0, 7);
}
export function monthName(month) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(month + '-01T00:00:00Z'));
}
export function occurrence(row) {
  if (row.type === 'coverageGap') return 'Sem cobertura informada';
  if (row.arrival && !row.exit && !row.absent && !row.subs.length) return 'Chegada confirmada';
  return row.subs.length ? 'Substituição' : row.exit ? 'Saída antecipada' : row.absent ? 'Ausência' : 'Previsto';
}
export function hasOccurrence(row, kind) {
  if (row.type === 'coverageGap') return !kind || kind === 'Sem cobertura informada';
  if (kind === 'Chegada confirmada') return Boolean(row.arrival || row.subs.some(sub => sub.arrival));
  return !kind || (kind === 'Substituição' && row.subs.length)
    || (kind === 'Saída antecipada' && row.exit) || (kind === 'Ausência' && row.absent)
    || (kind === 'Previsto' && occurrence(row) === kind);
}
export function heading(title, description, action = '') {
  return '<div class="page-heading"><div><h1>' + title + '</h1><p>' + description + '</p></div>' + action + '</div>';
}
export function empty(message) {
  return '<div class="empty">' + escape(message) + '</div>';
}
const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/>',
  escala: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16M10 9v11"/>',
  saida: '<path d="M10 17l5-5-5-5m5 5H3m11-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
  troca: '<path d="M4 7h16m-4-4 4 4-4 4m4 6H4m4-4-4 4 4 4"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  historico: '<path d="M3 12a9 9 0 1 1 3 7m-3-3v-4h4m5-5v5l3 2"/>',
  building: '<path d="M4 21h16M6 21V5l12-2v18M9 8h1m4 0h1m-6 4h1m4 0h1m-3 9v-5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  warning: '<path d="M10 4 3 18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1L14 4a2 2 0 0 0-4 0Z"/><path d="M12 9v4m0 3h.01"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m2-15a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4v2"/>',
  refresh: '<path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5m-4 7a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>'
};
export function icon(name) {
  if (name === 'cobertura') name = 'warning';
  if (name === 'chegada') name = 'check';
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
}
