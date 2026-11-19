const labels = {
  active: 'Cobertura ativa',
  uncovered: 'SEM COBERTURA DE TI',
  waiting: 'AGUARDANDO CHEGADA',
  substitution: 'Substituição em andamento',
  empty: 'Sem escala cadastrada',
  unknown: 'Sem consulta'
};

export function coverageDisplay(row) {
  const waiting = !row.arrivalRequired && row.status === 'uncovered' && !row.active?.length && Boolean(row.next);
  const status = waiting ? 'waiting' : row.status;
  return { status, label: labels[status], expected: status === 'waiting' ? row.awaiting?.[0] || row.next : null };
}

// API interval values encode Brasília's calendar fields on a UTC minute axis.
export function nextCoverageRefresh(data, now = new Date()) {
  if (!data) return null;
  const snapshotTime = Date.parse(data.now + 'Z');
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(now).replace(' ', 'T');
  const currentTime = Date.parse(local + 'Z');
  const changes = data.units.flatMap(row => [
    row.next?.from,
    ...(row.active || []).map(worker => worker.to),
    ...(row.activeReports || []).map(report => report.to)
  ]).filter(Number.isFinite).map(minute => minute * 60000).filter(time => time > snapshotTime);
  if (!changes.length) return null;
  return Math.min(60000, Math.max(100, Math.min(...changes) - currentTime + 100));
}
