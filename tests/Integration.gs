// Opcional: copie para o editor Apps Script e execute testSheetsIntegration.
// Usa exclusivamente a planilha de homologação indicada abaixo.
// O bloqueio impede operações da API durante a troca temporária da propriedade.
function testSheetsIntegration() {
  const testId = '1DNTAdokYm1bh_vbzmdml0Rk-og3pBdac3UklcXM6_ts';
  const properties = PropertiesService.getScriptProperties();
  const previousId = properties.getProperty('SPREADSHEET_ID');
  if (!previousId || previousId === testId) throw new Error('Configure a produção antes de executar este teste isolado.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const unit = 'MATERNIDADE ROCINHA';
  const prefix = 'HOMOLOGAÇÃO ' + Utilities.getUuid();
  const date = dateAt_(point_(localNow_(new Date()).slice(0, 10), '00:00') - 1440);
  const month = date.slice(0, 7);
  const passed = [];
  function check(condition, message) {
    if (!condition) throw new Error('Falhou: ' + message);
    passed.push(message);
  }
  function send(action, fields) {
    return mutate_({ action, unit, requestId: Utilities.getUuid(), ...fields });
  }
  function rows() {
    return read_({ action: 'month', unit, month }).filter(row => row.tech.startsWith(prefix));
  }
  function find(suffix) {
    return rows().find(row => row.tech === prefix + suffix);
  }
  function confirm(suffix, arrival, subId) {
    const row = find(suffix);
    send('confirmArrival', { id: row.id, revision: row.revision, arrival, subId: subId || '' });
  }
  try {
    properties.setProperty('SPREADSHEET_ID', testId);
    setupSheets_();
    const payload = { action: 'saveMonth', unit, month, requestId: Utilities.getUuid(), rows: [
      { date, tech: prefix + ' A', start: '08:00', end: '18:00' },
      { date, tech: prefix + ' B', start: '08:00', end: '18:00' },
      { date, tech: prefix + ' N', start: '19:00', end: '07:00' }
    ] };
    mutate_(payload);
    check(rows().length === 3, 'Lote gravado e recuperado em nova leitura do Sheets');
    check(mutate_(payload).replay === true && rows().length === 3, 'Reenvio idempotente sem duplicatas');
    check(coverage_(rows(), date + 'T09:00').status === 'waiting', 'Escala não confirma presença');
    confirm(' A', date + 'T08:05');
    confirm(' B', date + 'T08:00');
    check(coverage_(rows(), date + 'T09:00').active.length === 2, 'Duas chegadas persistidas individualmente');
    let first = find(' A');
    send('exit', { id: first.id, revision: first.revision, exit: '12:00', reason: 'Teste isolado de saída' });
    check(coverage_(rows(), date + 'T12:30').active.length === 1, 'Saída de um técnico mantém cobertura do outro');
    first = find(' A');
    send('substitute', { id: first.id, revision: first.revision, name: prefix + ' S', start: '13:00', end: '18:00',
      originalAbsent: false, reason: 'Teste isolado de substituição' });
    first = find(' A');
    check(coverage_([first], date + 'T13:10').status === 'waiting', 'Substituto aguarda chegada própria');
    confirm(' A', date + 'T13:20', first.subs[0].id);
    first = find(' A');
    check(coverage_([first], date + 'T13:30').status === 'substitution', 'Substituição confirmada recuperada do Sheets');
    check(coverage_([first], date + 'T12:30').active.length === 0, 'Intervalo entre saída e chegada permanece descoberto');
    confirm(' N', date + 'T19:00');
    const following = dateAt_(point_(date, '00:00') + 1440);
    check(coverage_(rows(), following + 'T06:59').active.length === 1, 'Chegada de plantão noturno persiste no dia seguinte');
    check(coverage_(rows(), following + 'T07:00').active.length === 0, 'Cobertura noturna expira no término');
    first = find(' A');
    send('correctArrival', { id: first.id, revision: first.revision, arrival: date + 'T08:10', correction: 'Teste de correção auditada' });
    check(find(' A').arrival === date + 'T08:10', 'Correção da chegada persistida');
    const ids = rows().map(row => row.id);
    send('saveMonth', { month, rows: [], remove: rows().map(row => ({ id: row.id, revision: row.revision })) });
    check(rows().length === 0, 'Registros de teste desativados logicamente');
    const history = values_(testId, [HISTORY])[0].filter(row => ids.includes(row[3]));
    check(history.some(row => row[2] === 'Chegada confirmada') && history.some(row => row[2] === 'Correção de chegada'), 'Histórico preserva confirmação e correção');
    console.log(JSON.stringify({ verified: true, spreadsheetId: testId, passed }, null, 2));
  } finally {
    properties.setProperty('SPREADSHEET_ID', previousId);
    lock.releaseLock();
  }
}
