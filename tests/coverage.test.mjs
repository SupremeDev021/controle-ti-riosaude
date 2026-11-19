import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { coverageDisplay, nextCoverageRefresh } from '../js/status-cobertura.js';
import { monthDates, shiftKey } from '../js/montagem.js';
import { tvLayout, tvCard } from '../js/tv.js';
import { units } from '../js/utils.js';

test('calendário gera todos os dias, incluindo ano bissexto, e rejeita mês inválido', () => {
  assert.equal(monthDates('2028-02').length, 29);
  assert.equal(monthDates('2026-02').length, 28);
  assert.equal(monthDates('2026-12').at(-1), '2026-12-31');
  assert.throws(() => monthDates('2026-13'));
  assert.throws(() => monthDates('2026-00'));
});

test('montagem identifica duplicatas preservando horários distintos do mesmo técnico', () => {
  const base = { date: '2026-11-19', tech: ' João Silva ', start: '07:00', end: '19:00' };
  assert.equal(shiftKey(base), shiftKey({ ...base, tech: 'joão silva' }));
  assert.notEqual(shiftKey(base), shiftKey({ ...base, start: '19:00', end: '07:00' }));
});

test('catálogo tem as 14 unidades e modo TV reserva espaço para todos os cartões', () => {
  assert.equal(units.length, 14);
  assert.equal(new Set(units).size, 14);
  assert.ok(units.includes('MATERNIDADE ROCINHA'));
  assert.deepEqual(tvLayout(14, 1920), { columns: 4, rows: 4 });
  assert.deepEqual(tvLayout(14, 1280), { columns: 4, rows: 4 });
  assert.equal(tvLayout(14, 600).columns * tvLayout(14, 600).rows, 14);
});

test('cartão TV mostra todos os técnicos ativos e protege texto informado', () => {
  const html = tvCard({ unit: '<Unidade>', status: 'active', active: [
    { name: 'Primeiro', from: 0, to: 60 }, { name: 'Segundo', from: 0, to: 60 }
  ] });
  assert.ok(html.includes('Primeiro'));
  assert.ok(html.includes('Segundo'));
  assert.ok(html.includes('&lt;Unidade&gt;'));
  assert.ok(!html.includes('data-arrival'));
});

const source = ['Coverage.gs','Code.gs'].map(name => readFileSync(new URL('../apps-script/' + name, import.meta.url), 'utf8')).join('\n');
const unit = 'CER BARRA';
const date = '2026-11-17';
const month = date.slice(0, 7);
const row = (fields = {}) => {
  const result = { date, tech: 'Técnico A', start: '07:00', end: '19:00', subs: [], ...fields };
  if (!Object.hasOwn(fields, 'arrival')) result.arrival = result.date + 'T' + result.start;
  result.subs = result.subs.map(sub => {
    if (Object.hasOwn(sub, 'arrival')) return sub;
    const arrivalDate = new Date(result.date + 'T00:00:00Z');
    if (sub.start < result.start) arrivalDate.setUTCDate(arrivalDate.getUTCDate() + 1);
    return { ...sub, arrival: arrivalDate.toISOString().slice(0,10) + 'T' + sub.start };
  });
  return result;
};
const { coverage_, point_, dateAt_, date_ } = runInNewContext(source + '\n({ coverage_, point_, dateAt_, date_ })');
const current = (rows, time, day = date) => coverage_(rows, day + 'T' + time);

test('plantão noturno atravessa o mês e termina no horário previsto', () => {
  const rows = [row({ date: '2026-11-30', start: '19:00', end: '07:00' })];
  assert.equal(current(rows, '06:59', '2026-12-01').status, 'active');
  assert.equal(current(rows, '07:00', '2026-12-01').status, 'uncovered');
  assert.equal(dateAt_(current(rows, '06:59', '2026-12-01').active[0].to), '2026-12-01');
});

test('dois técnicos simultâneos e saída antecipada de apenas um', () => {
  const rows = [row({ exit: '14:30' }), row({ tech: 'Técnico B' })];
  assert.equal(current(rows, '14:29').active.length, 2);
  const after = current(rows, '14:30');
  assert.equal(after.active.length, 1);
  assert.equal(after.active[0].name, 'Técnico B');
  assert.equal(after.status, 'active');
  assert.equal(after.exits.length, 1);
});

test('substituição atrasada deixa um intervalo descoberto e preserva a cobertura anterior', () => {
  const rows = [row({ exit: '13:00', subs: [{ name: 'Substituto A', start: '14:00', end: '19:00' }] })];
  assert.equal(current(rows, '12:59').status, 'active');
  const gap = current(rows, '13:30');
  assert.equal(gap.status, 'uncovered');
  assert.equal(gap.gap.from, point_(date, '13:00'));
  assert.equal(gap.gap.to, point_(date, '14:00'));
  assert.equal(current(rows, '14:00').status, 'substitution');
});

test('unidade sem escala e unidade com escala futura têm estados distintos', () => {
  assert.equal(current([], '05:00').status, 'empty');
  assert.equal(current([row()], '05:00').status, 'uncovered');
  assert.equal(current([row()], '05:00').next.name, 'Técnico A');
});

test('múltiplas substituições, ausência e troca de dia', () => {
  const rows = [row({ start: '19:00', end: '07:00', absent: true, subs: [
    { name: 'Substituto A', start: '20:00', end: '01:00' },
    { name: 'Substituto B', start: '02:00', end: '07:00' }
  ] })];
  assert.equal(current(rows, '19:00').status, 'uncovered');
  assert.equal(current(rows, '23:59').active[0].name, 'Substituto A');
  assert.equal(current(rows, '01:30', '2026-11-18').status, 'uncovered');
  assert.equal(current(rows, '02:00', '2026-11-18').active[0].name, 'Substituto B');
  assert.equal(current(rows, '02:00', '2026-11-18').substitutions.length, 1);
});

test('titular presente termina quando o substituto assume', () => {
  const rows = [row({ subs: [{ name: 'Substituto A', start: '15:00', end: '19:00' }] })];
  assert.equal(current(rows, '14:59').active[0].name, 'Técnico A');
  const handover = current(rows, '15:00');
  assert.equal(handover.active.length, 1);
  assert.equal(handover.active[0].name, 'Substituto A');
});

test('datas e limites de início e fim são validados', () => {
  assert.throws(() => date_('2026-02-30'), /Data inválida/);
  assert.equal(current([row()], '06:59').status, 'uncovered');
  assert.equal(current([row()], '07:00').status, 'active');
  assert.equal(current([row()], '19:00').status, 'uncovered');
});

function simulate(now = date + 'T12:00:00') {
  const sheets = new Map([[unit, { id: 10, rows: [] }], ['HISTORICO', { id: 11, rows: [] }]]);
  const cache = new Map();
  let locked = false;
  let paused = false;
  let failBatch = false;
  let batchCount = 0;
  const { execute_, read_ } = runInNewContext(source + '\n({ execute_, read_ })', {
    Utilities: { getUuid: randomUUID, formatDate: () => now, base64Encode: value => value.toString('base64'),
      DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (hash, str) => createHash(hash).update(str).digest() },
    LockService: { getScriptLock: () => ({ tryLock() { if (locked || paused) return false; locked = true; return true; },
      releaseLock() { assert.equal(locked, true); locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test' }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    Sheets: { Spreadsheets: {
      Values: { batchGet: (_, { ranges }) => ({ valueRanges: ranges.map(range => ({
        values: sheets.get(range.split("'")[1])?.rows || []
      })) }) },
      get: () => ({ sheets: [...sheets].map(([title,sheet]) => ({ properties: { title, sheetId: sheet.id } })) }),
      batchUpdate: ({ requests }) => {
        assert.equal(locked, true);
        if (failBatch) throw new Error('simulated failed batch');
        batchCount++;
        for (const request of requests) {
          const append = request.appendCells;
          const part = append || request.updateCells;
          const rows = [...sheets.values()].find(item => item.id === (append ? part.sheetId : part.start.sheetId)).rows;
          const values = part.rows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue));
          if (append) rows.push(...values);
          else rows[part.start.rowIndex - 1] = values[0];
        }
      }
    } },
    console: { error() {} },
  });
  return { send: (action, fields) => execute_({ action, unit, requestId: randomUUID(), ...fields }, true),
    execute_, history: () => sheets.get('HISTORICO').rows, data: () => sheets.get(unit).rows,
    count: () => batchCount, busy: value => { paused = value; }, fail: value => { failBatch = value; },
    month: wanted => read_({ action: 'month', unit, month: wanted }) };
}

test('lote idempotente após repetição e histórico gravado junto com os dados', () => {
  const io = simulate();
  const input = { action: 'saveMonth', unit, month, rows: [row(), row({ tech: 'Técnico B' })], requestId: randomUUID() };
  assert.equal(io.execute_(input, true).data.changed, 2);
  assert.equal(io.execute_(input, true).data.replay, true);
  assert.equal(io.execute_({ ...input, rows: [] }, true).code, 'CONFLICT');
  assert.equal(io.count(), 1);
  assert.equal(io.data().length, 2);
  assert.equal(io.history().length, 2);
});

test('lock ocupado e edição concorrente com revisão antiga são tratados', () => {
  const io = simulate();
  io.busy(true);
  assert.equal(io.send('saveMonth', { month, rows: [row()] }).code, 'BUSY');
  io.busy(false);
  assert.equal(io.send('saveMonth', { month, rows: [row()] }).ok, true);
  const old = io.month(month)[0];
  assert.equal(io.send('exit', { id: old.id, revision: old.revision, exit: '15:00', reason: 'Teste' }).ok, true);
  assert.equal(io.send('editShift', { month, shift: { ...old, tech: 'Técnico B' } }).code, 'CONFLICT');
  assert.equal(io.month(month)[0].tech, 'Técnico A');
  assert.equal(io.month(month)[0].exit, '15:00');
  assert.equal(io.history().length, 2);
});

test('falha no lote preserva a escala e permite repetir a operação', () => {
  const io = simulate();
  const input = { action: 'saveMonth', unit, month, rows: [row()], requestId: randomUUID() };
  io.fail(true);
  assert.equal(io.execute_(input, true).code, 'SHEETS');
  assert.equal(io.data().length + io.history().length, 0);
  io.fail(false);
  assert.equal(io.execute_(input, true).ok, true);
  assert.equal(io.data().length + io.history().length, 2);
});

test('exclusão lógica mantém o registro e dados de outros meses', () => {
  const io = simulate();
  assert.equal(io.send('saveMonth', { month, rows: [row()] }).ok, true);
  assert.equal(io.send('saveMonth', { month: '2026-12', rows: [row({ date: '2026-12-01' })] }).ok, true);
  const shift = io.month(month)[0];
  assert.equal(io.send('deactivateShift', { month, shift }).ok, true);
  assert.equal(io.month(month).length, 0);
  assert.equal(io.month('2026-12').length, 1);
  assert.equal(io.data().length, 2);
  assert.equal(JSON.parse(io.history()[2][4]).deleted, false);
  assert.equal(JSON.parse(io.history()[2][5]).deleted, true);
});

test('duas substituições persistem com seus horários e motivos independentes', () => {
  const io = simulate();
  assert.equal(io.send('saveMonth', { month, rows: [row()] }).ok, true);
  let shift = io.month(month)[0];
  const replace = (name, start, end, reason) => io.send('substitute', {
    id: shift.id, revision: shift.revision, name, start, end, reason, originalAbsent: false
  });
  assert.equal(replace('Substituto A', '12:00', '15:00', 'Motivo A').ok, true);
  shift = io.month(month)[0];
  assert.equal(replace('Substituto B', '14:00', '19:00', 'Sobreposição').code, 'VALIDATION');
  assert.equal(replace('Substituto B', '15:00', '19:00', 'Motivo B').ok, true);
  shift = io.month(month)[0];
  assert.equal(shift.tech, 'Técnico A');
  assert.equal(shift.reason, '');
  assert.equal(shift.subs[0].reason, 'Motivo A');
  assert.equal(shift.subs[1].reason, 'Motivo B');
  assert.equal(io.data()[0][5], 'Substituição');
  assert.equal(io.history().length, 3);
});

test('correção e cancelamento de saída preservam histórico e recalculam cobertura noturna', () => {
  const io = simulate(date + 'T23:00:00');
  io.send('saveMonth', { month, rows: [row({ start: '19:00', end: '07:00' })] });
  let shift = io.month(month)[0];
  assert.equal(io.send('confirmArrival', { id: shift.id, revision: shift.revision, arrival: date + 'T19:00' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(io.send('exit', { id: shift.id, revision: shift.revision, exit: '02:00', reason: 'Saída' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(current([shift], '03:00', '2026-11-18').status, 'uncovered');
  assert.equal(io.send('correctExit', { id: shift.id, revision: shift.revision, exit: '04:00',
    reason: 'Saída corrigida', correction: 'Horário digitado incorretamente' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(current([shift], '03:00', '2026-11-18').status, 'active');
  assert.equal(io.send('correctExit', { id: shift.id, revision: shift.revision, exit: '12:00',
    reason: 'Inválido', correction: 'Teste' }).code, 'VALIDATION');
  assert.equal(io.send('cancelExit', { id: shift.id, revision: shift.revision, correction: 'Ocorrência indevida' }).ok, true);
  assert.equal(io.month(month)[0].exit, '');
  assert.equal(current(io.month(month), '06:00', '2026-11-18').status, 'active');
  assert.equal(io.history()[3][2], 'Correção de saída');
  assert.equal(JSON.parse(io.history()[3][4]).exit, '02:00');
  assert.equal(JSON.parse(io.history()[3][5]).exit, '04:00');
  assert.equal(io.history()[4][2], 'Cancelamento de saída');
});

test('correção de uma substituição mantém as demais e o titular', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row()] });
  let shift = io.month(month)[0];
  const replace = (name, start, end) => io.send('substitute', { id: shift.id, revision: shift.revision,
    name, start, end, originalAbsent: true, reason: 'Ausência do titular' });
  assert.equal(replace('Substituto A', '09:00', '13:00').ok, true);
  shift = io.month(month)[0];
  assert.equal(replace('Substituto B', '14:00', '19:00').ok, true);
  shift = io.month(month)[0];
  const firstId = shift.subs[0].id;
  const secondId = shift.subs[1].id;
  const correction = { id: shift.id, revision: shift.revision, subId: firstId, name: 'Substituto A',
    start: '08:00', end: '14:00', originalAbsent: true, reason: 'Troca corrigida', correction: 'Ajuste do intervalo' };
  assert.equal(io.send('correctSubstitution', correction).ok, true);
  assert.equal(io.send('correctSubstitution', correction).code, 'CONFLICT');
  shift = io.month(month)[0];
  assert.equal(shift.tech, 'Técnico A');
  assert.equal(shift.subs.length, 2);
  assert.equal(shift.subs[1].id, secondId);
  assert.equal(io.send('confirmArrival', { id: shift.id, revision: shift.revision, subId: firstId, arrival: date + 'T08:00' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(current([shift], '08:30').active[0].name, 'Substituto A');
  assert.equal(io.send('cancelSubstitution', { id: shift.id, revision: shift.revision,
    subId: firstId, correction: 'Troca cancelada' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(shift.subs.length, 1);
  assert.equal(shift.subs[0].id, secondId);
  assert.equal(current([shift], '08:30').status, 'uncovered');
  assert.equal(io.history()[3][2], 'Correção de substituição');
  assert.equal(io.history()[5][2], 'Cancelamento de substituição');
});

test('edição mensal mantém IDs e recupera registros persistidos em nova consulta', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row(), row({ tech: 'Técnico B' }), row({ date: '2026-11-18' })] });
  const previous = io.month(month);
  assert.equal(io.send('saveMonth', { month, rows: [{ ...previous[0], tech: 'Nome corrigido', end: '18:00' }], remove: [] }).ok, true);
  const recovered = io.month(month);
  assert.equal(recovered.length, 3);
  assert.equal(recovered[0].id, previous[0].id);
  assert.equal(recovered[0].tech, 'Nome corrigido');
  assert.equal(recovered[1].id, previous[1].id);
  assert.equal(io.history()[3][2], 'Alteração');
});

test('substituição legada sem ID pode ser corrigida sem duplicar o registro', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row()] });
  const stored = io.data()[0];
  stored[6] = 'Substituto legado';
  stored[7] = '09:00';
  stored[8] = '19:00';
  stored[13] = '';
  const shift = io.month(month)[0];
  assert.equal(shift.subs[0].id, 'legacy-0');
  assert.equal(io.send('correctSubstitution', { id: shift.id, revision: shift.revision,
    subId: shift.subs[0].id, name: 'Substituto corrigido', start: '08:00', end: '19:00',
    originalAbsent: false, reason: 'Motivo', correction: 'Corrigir cadastro antigo' }).ok, true);
  const recovered = io.month(month)[0];
  assert.equal(recovered.subs.length, 1);
  assert.equal(recovered.id, shift.id);
  assert.equal(recovered.subs[0].id, 'legacy-0');
  assert.equal(recovered.subs[0].name, 'Substituto corrigido');
});

test('falta de cobertura pode ser informada sem escala e expira ao fim do intervalo', () => {
  const io = simulate();
  assert.equal(io.send('reportCoverageGap', { date, start: '08:00', end: '12:00', reason: 'Equipe indisponível' }).ok, true);
  const cells = io.data()[0];
  const { decode_ } = runInNewContext(source + '\n({ decode_ })');
  const report = decode_(cells);
  assert.equal(report.type, 'coverageGap');
  assert.equal(report.tech, '');
  assert.equal(io.month(month).length, 0);
  assert.equal(current([report], '07:59').status, 'empty');
  assert.equal(current([report], '08:00').status, 'uncovered');
  assert.equal(current([report], '12:00').status, 'empty');
  assert.equal(current([report], '09:00').activeReports[0].reason, 'Equipe indisponível');
  assert.equal(io.history()[0][2], 'Unidade sem cobertura');
});

test('informação de unidade sem cobertura prevalece sobre técnicos planejados e substitutos', () => {
  const report = row({ type: 'coverageGap', tech: '', start: '10:00', end: '11:00' });
  const shift = row({ absent: true, subs: [{ name: 'Substituto', start: '08:00', end: '19:00' }] });
  const rows = [shift, row({ tech: 'Técnico B' }), report];
  assert.equal(current(rows, '09:59').active.length, 2);
  assert.equal(current(rows, '10:00').active.length, 0);
  assert.equal(current(rows, '10:30').status, 'uncovered');
  assert.equal(current(rows, '11:00').status, 'substitution');
  assert.equal(current(rows, '12:00').substitutions.length, 1);
});

test('falta de cobertura noturna mantém as datas corretas e permite cancelamento auditado', () => {
  const io = simulate();
  const payload = { date, start: '23:00', end: '03:00', reason: 'Indisponibilidade noturna' };
  assert.equal(io.send('reportCoverageGap', payload).ok, true);
  assert.equal(io.send('reportCoverageGap', payload).code, 'VALIDATION');
  const { decode_ } = runInNewContext(source + '\n({ decode_ })');
  const report = decode_(io.data()[0]);
  assert.equal(current([report], '02:59', '2026-11-18').status, 'uncovered');
  assert.equal(current([report], '03:00', '2026-11-18').status, 'empty');
  assert.equal(io.send('cancelCoverageGap', { id: report.id, revision: report.revision, correction: '' }).code, 'VALIDATION');
  assert.equal(io.send('cancelCoverageGap', { id: report.id, revision: report.revision, correction: 'Registro indevido' }).ok, true);
  assert.equal(io.send('cancelCoverageGap', { id: report.id, revision: report.revision, correction: 'Repetição' }).code, 'CONFLICT');
  assert.equal(io.data().length, 1);
  assert.equal(JSON.parse(io.history()[1][5]).deleted, true);
  assert.equal(io.history()[1][2], 'Cancelamento de falta de cobertura');
});


test('dashboard mostra falta de cobertura após saída sem reposição prevista', () => {
  const result = current([row({ exit: '13:00' })], '13:00');
  assert.equal(coverageDisplay(result).label, 'SEM COBERTURA DE TI');
  assert.equal(coverageDisplay(result).status, 'uncovered');
  assert.equal(result.active.length, 0);
});

test('dashboard exige confirmação do substituto após o minuto previsto', () => {
  const rows = [row({ exit: '13:00', subs: [{ name: 'Cobertura', start: '14:00', end: '19:00', arrival: '' }] })];
  assert.equal(coverageDisplay(current(rows, '12:59')).status, 'active');
  const before = current(rows, '13:59');
  assert.equal(before.status, 'uncovered');
  assert.equal(coverageDisplay(before).label, 'SEM COBERTURA DE TI');
  assert.equal(before.next.name, 'Cobertura');
  assert.equal(coverageDisplay(current(rows, '14:00')).status, 'waiting');
  rows[0].subs[0].arrival = date + 'T14:08';
  assert.equal(coverageDisplay(current(rows, '14:08')).status, 'substitution');
  assert.equal(coverageDisplay(current(rows, '19:00')).label, 'SEM COBERTURA DE TI');
});

test('aguarda um próximo técnico regular e mantém cobertura se outro técnico estiver ativo', () => {
  const rows = [row({ exit: '13:00' }), row({ tech: 'Próximo técnico', start: '14:00', end: '19:00', arrival: '' })];
  assert.equal(coverageDisplay(current(rows, '13:30')).status, 'uncovered');
  assert.equal(coverageDisplay(current(rows, '14:00')).status, 'waiting');
  assert.equal(coverageDisplay(current([...rows, row({ tech: 'Outro técnico' })], '13:30')).status, 'active');
  assert.equal(coverageDisplay(current([], '13:30')).status, 'empty');
});

test('aviso de chegada funciona na madrugada e programa atualização na virada do horário', () => {
  const rows = [row({ start: '19:00', end: '07:00', exit: '23:00',
    subs: [{ name: 'Cobertura noturna', start: '01:00', end: '07:00', arrival: '' }] })];
  const before = current(rows, '00:59', '2026-11-18');
  assert.equal(coverageDisplay(before).status, 'uncovered');
  assert.equal(dateAt_(before.next.from), '2026-11-18');
  assert.equal(coverageDisplay(current(rows, '01:00', '2026-11-18')).status, 'waiting');
  const delay = nextCoverageRefresh({ now: '2026-11-18T00:59:30', units: [before] }, new Date('2026-11-18T03:59:30Z'));
  assert.equal(delay, 30100);
});


test('escala nova e registro legado aguardam confirmação sem assumir presença', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row(), row({ tech: 'Técnico B' })] });
  let rows = io.month(month);
  assert.equal(rows.every(item => !item.arrival), true);
  assert.equal(current(rows, '08:00').status, 'waiting');
  const first = rows[0];
  assert.equal(io.send('confirmArrival', { id: first.id, revision: first.revision, arrival: date + 'T07:08' }).ok, true);
  rows = io.month(month);
  assert.equal(current(rows, '08:00').status, 'active');
  assert.equal(current(rows, '08:00').active.length, 1);
  assert.equal(current(rows, '19:00').active.length, 0);
  assert.equal(io.data()[0][5], 'CHEGADA CONFIRMADA');
  assert.equal(io.history()[2][2], 'Chegada confirmada');
});

test('confirmação é individual, idempotente e suas correções ficam no histórico', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row()] });
  let shift = io.month(month)[0];
  const payload = { action: 'confirmArrival', unit, id: shift.id, revision: shift.revision,
    arrival: date + 'T07:08', requestId: randomUUID() };
  assert.equal(io.execute_(payload, true).ok, true);
  assert.equal(io.execute_(payload, true).data.replay, true);
  shift = io.month(month)[0];
  assert.equal(io.send('confirmArrival', { ...payload, revision: shift.revision, requestId: randomUUID() }).code, 'CONFLICT');
  assert.equal(io.send('correctArrival', { id: shift.id, revision: shift.revision,
    arrival: date + 'T07:20', correction: 'Corrigir digitação' }).ok, true);
  shift = io.month(month)[0];
  assert.equal(current([shift], '07:15').active.length, 0);
  assert.equal(current([shift], '07:20').active.length, 1);
  assert.equal(io.send('cancelArrival', { id: shift.id, revision: shift.revision, correction: 'Confirmação indevida' }).ok, true);
  assert.equal(current(io.month(month), '08:00').status, 'waiting');
  assert.equal(io.history()[2][2], 'Correção de chegada');
  assert.equal(io.history()[3][2], 'Cancelamento de chegada');
});

test('substituição requer chegada própria e confirmações futuras são rejeitadas', () => {
  const io = simulate();
  io.send('saveMonth', { month, rows: [row()] });
  let shift = io.month(month)[0];
  io.send('substitute', { id: shift.id, revision: shift.revision, name: 'Substituto',
    start: '09:00', end: '19:00', reason: 'Ausência', originalAbsent: true });
  shift = io.month(month)[0];
  assert.equal(current([shift], '10:00').status, 'waiting');
  const fields = { id: shift.id, revision: shift.revision, subId: shift.subs[0].id };
  assert.equal(io.send('confirmArrival', { ...fields, arrival: date + 'T13:00' }).code, 'VALIDATION');
  assert.equal(io.send('confirmArrival', { ...fields, arrival: date + 'T09:15' }).ok, true);
  assert.equal(current(io.month(month), '10:00').status, 'substitution');
});

test('confirmação noturna persiste com data completa e consulta na madrugada seguinte', () => {
  const io = simulate('2026-11-18T04:00:00');
  io.send('saveMonth', { month, rows: [row({ start: '19:00', end: '07:00' })] });
  const shift = io.month(month)[0];
  assert.equal(io.send('confirmArrival', { id: shift.id, revision: shift.revision, arrival: date + 'T19:12' }).ok, true);
  const persisted = io.month(month)[0];
  assert.equal(persisted.arrival, date + 'T19:12');
  assert.equal(current([persisted], '03:00', '2026-11-18').status, 'active');
  assert.equal(current([persisted], '07:00', '2026-11-18').active.length, 0);
  const candidates = io.execute_({ action: 'arrivalCandidates', unit, date: '2026-11-18' }, false);
  assert.equal(candidates.data.length, 1);
  assert.equal(candidates.data[0].id, shift.id);
});

test('catálogo do servidor inclui Maternidade Rocinha e health identifica a versão', () => {
  const io = simulate();
  const catalog = io.execute_({ action: 'units' }, false);
  assert.equal(catalog.data.length, 14);
  assert.ok(catalog.data.includes('MATERNIDADE ROCINHA'));
  const health = io.execute_({ action: 'health' }, false);
  assert.equal(health.data.version, 3);
  assert.equal(health.data.unitCount, 14);
  assert.equal(health.data.timeZone, 'America/Sao_Paulo');
});


