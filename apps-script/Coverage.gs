function localNow_(date) {
  return Utilities.formatDate(date, 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss");
}

function point_(date, time) {
  return Date.parse(date + 'T' + time + ':00Z') / 60000;
}

function dateAt_(minute) {
  return new Date(minute * 60000).toISOString().slice(0, 10);
}

function interval_(date, start, end) {
  const from = point_(date, start);
  const to = point_(date, end) + (end <= start ? 1440 : 0);
  return { from, to };
}

function inShift_(row, time) {
  const from = point_(row.date, row.start);
  const minute = point_(row.date, time);
  return minute < from ? minute + 1440 : minute;
}

function datetime_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) invalid_('Data e hora de chegada inválidas.');
  return point_(date_(value.slice(0,10)), time_(value.slice(11,16)));
}

function plannedWork_(row) {
  const planned = interval_(row.date, row.start, row.end);
  const subs = row.subs.map(sub => {
    const from = inShift_(row, sub.start);
    const to = from + (point_(row.date, sub.end) - point_(row.date, sub.start) + 1440) % 1440;
    return { ...sub, from, to, substitute: true, original: row.tech, subId: sub.id || '', shiftId: row.id };
  }).sort((a, b) => a.from - b.from);
  const end = Math.min(planned.to, row.exit ? inShift_(row, row.exit) : Infinity,
    row.absent ? planned.from : Infinity, subs[0]?.from ?? Infinity);
  return [{ name: row.tech, from: planned.from, to: end, substitute: false, arrival: row.arrival || '', shiftId: row.id, subId: '' }, ...subs]
    .filter(item => item.to > item.from);
}

function work_(row) {
  return plannedWork_(row).filter(worker => worker.arrival)
    .map(worker => ({ ...worker, from: Math.max(worker.from, datetime_(worker.arrival)) }))
    .filter(worker => worker.to > worker.from);
}

function gaps_(work, from, to) {
  let cursor = from;
  const gaps = [];
  work.filter(item => item.to > from && item.from < to).sort((a, b) => a.from - b.from)
    .forEach(item => {
      if (item.from > cursor) gaps.push({ from: cursor, to: item.from });
      cursor = Math.max(cursor, item.to);
    });
  if (cursor < to) gaps.push({ from: cursor, to });
  return gaps;
}

function coverage_(rows, now) {
  const date = now.slice(0, 10);
  const minute = point_(date, now.slice(11, 16));
  const day = point_(date, '00:00');
  const reports = rows.filter(row => row.type === 'coverageGap')
    .map(row => ({ ...row, ...interval_(row.date, row.start, row.end) }));
  const schedule = rows.filter(row => row.type !== 'coverageGap')
    .map(row => ({ ...row, ...interval_(row.date, row.start, row.end) }));
  const today = schedule.filter(row => row.from < day + 1440 && row.to > day);
  const scheduledWork = schedule.flatMap(plannedWork_);
  let work = schedule.flatMap(work_);
  reports.forEach(report => {
    work = work.flatMap(item => {
      if (item.to <= report.from || item.from >= report.to) return [item];
      const parts = [];
      if (item.from < report.from) parts.push({ ...item, to: report.from });
      if (item.to > report.to) parts.push({ ...item, from: report.to });
      return parts;
    });
  });
  const active = work.filter(item => item.from <= minute && minute < item.to);
  const planned = today.filter(row => row.from <= minute && minute < row.to);
  const next = scheduledWork.filter(item => item.from > minute).sort((a, b) => a.from - b.from)[0] || null;
  const dailyReports = reports.filter(report => report.from < day + 1440 && report.to > day);
  const activeReports = dailyReports.filter(report => report.from <= minute && minute < report.to);
  const gaps = today.length ? gaps_(work, day, day + 1440)
    : dailyReports.map(report => ({ from: Math.max(day, report.from), to: Math.min(day + 1440, report.to) }));
  const gap = gaps.find(item => item.from <= minute && minute < item.to) || null;
  const awaiting = schedule.flatMap(row => plannedWork_(row).map(worker => ({
    ...worker, id: row.id, revision: row.revision, date: row.date
  }))).filter(worker => !worker.arrival && worker.to > minute && worker.from < day + 1440);
  const waitingNow = awaiting.some(worker => worker.from <= minute);
  const status = active.some(item => item.substitute) ? 'substitution'
    : active.length ? 'active' : activeReports.length ? 'uncovered' : waitingNow ? 'waiting'
      : today.length ? 'uncovered' : 'empty';
  const exits = schedule.filter(row => row.exit && dateAt_(inShift_(row, row.exit)) === date);
  const substitutions = scheduledWork.filter(item => item.substitute && dateAt_(item.from) === date);
  const updated = [...today, ...dailyReports].map(row => row.updated).sort().pop() || '';
  return { status, active, planned, today, next, gap, gaps, exits, substitutions, updated,
    reports: dailyReports, activeReports, awaiting, arrivalRequired: true };
}
