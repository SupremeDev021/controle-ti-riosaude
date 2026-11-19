import { coverageDisplay } from './status-cobertura.js';
import { displayAt, escape, minuteDate, minuteTime, periodLabel } from './utils.js';

export function tvLayout(count, width) {
  const columns = width >= 1000 ? 4 : width >= 650 ? 3 : 2;
  return { columns, rows: Math.ceil(count / columns) };
}

export function tvCard(row) {
  const status = coverageDisplay(row);
  const people = row.active?.length ? row.active : (row.awaiting || []).filter(worker =>
    (row.planned || []).some(shift => shift.id === worker.id));
  const persons = people.length ? people.map(person => '<div class="tv-person"><strong>'
    + escape(person.name) + (person.substitute ? ' · substituto' : '') + '</strong><span>Entrada '
    + minuteTime(person.from) + ' · Saída ' + minuteTime(person.to) + '</span></div>').join('')
    : '<div class="tv-person"><span>Nenhum técnico com cobertura confirmada</span></div>';
  const next = row.next ? '<div class="tv-next"><strong>Próximo</strong> ' + escape(row.next.name)
    + ' · ' + displayAt(minuteDate(row.next.from) + 'T' + minuteTime(row.next.from)) + '</div>' : '';
  return '<article class="tv-card ' + status.status + '"><h2>' + escape(row.unit) + '</h2>'
    + '<span class="status ' + status.status + '">' + status.label + '</span><div class="tv-people">' + persons + '</div>'
    + next + (row.activeReports?.length ? '<p class="tv-reason">' + escape(row.activeReports.map(report => report.reason).join(' · ')) + '</p>' : '') + '</article>';
}

export function fitTv(root, count) {
  const grid = root.querySelector('.tv-grid');
  if (!grid) return;
  const layout = tvLayout(count, root.clientWidth);
  grid.style.setProperty('--tv-columns', layout.columns);
  grid.style.setProperty('--tv-rows', layout.rows);
  grid.querySelectorAll('.tv-card').forEach(card => {
    card.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(card).fontSize);
    while (card.scrollHeight > card.clientHeight + 1 && size > 8) {
      size -= 0.5;
      card.style.fontSize = size + 'px';
    }
  });
}
