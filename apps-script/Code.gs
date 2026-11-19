const UNITS = ['CER BARRA', 'UPA CIDADE DE DEUS', 'UPA COSTA BARROS', 'UPA DEL CASTILHO',
  'UPA ENGENHO DE DENTRO', 'UPA JOAO XXIII', 'UPA MADUREIRA', 'UPA MAGALHAES BASTOS',
  'UPA PACIÊNCIA', 'UPA ROCHA MIRANDA', 'UPA SENADOR CAMARA', 'UPA SEPETIBA', 'UPA VILA KENNEDY',
  'MATERNIDADE ROCINHA'];
const API_VERSION = 3;
const FIELDS = ['ID','Data','Técnico','Início','Término','Situação','Substituto','Início substituição',
  'Término substituição','Saída real','Motivo','Observações','Atualização','Metadados'];
const AUDIT = ['Data/hora','Unidade','Operação','ID do registro','Dados anteriores','Dados posteriores','Requisição','Digest'];
const HISTORY = 'HISTORICO';
const OPS = ['Cadastro','Alteração','Exclusão lógica','Saída antecipada','Substituição','Ausência',
  'Correção de saída','Cancelamento de saída','Correção de substituição','Cancelamento de substituição',
  'Unidade sem cobertura','Cancelamento de falta de cobertura','Chegada confirmada','Correção de chegada','Cancelamento de chegada'];

function setupSheets() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { setupSheets_(); } finally { lock.releaseLock(); }
}

function setupSheets_(spreadsheetId) {
  const id = spreadsheetId || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Configure SPREADSHEET_ID nas propriedades do script.');
  const book = SpreadsheetApp.openById(id);
  book.setSpreadsheetTimeZone('America/Sao_Paulo');
  [...UNITS, HISTORY].forEach(name => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    const fields = name === HISTORY ? AUDIT : FIELDS;
    const header = sheet.getRange(1, 1, 1, fields.length);
    const existing = header.getValues()[0];
    if (sheet.getLastRow() && existing.some((value, index) => value && value !== fields[index])) {
      throw new Error('Cabeçalhos incompatíveis em ' + name);
    }
    header.setValues([fields]).setBackground('#e9eef4').setFontColor('#172e49').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideColumns(name === HISTORY ? 7 : 14, name === HISTORY ? 2 : 1);
  });
  const extra = book.getSheets().find(sheet => /^(Sheet1|Página1|Planilha1)$/.test(sheet.getName()));
  if (extra && extra.getLastRow() === 0) book.deleteSheet(extra);
  SpreadsheetApp.flush();
}

function doGet(e) {
  return json_(execute_(e.parameter || {}, false));
}

function doPost(e) {
  const params = e.parameter || {};
  const bridge = params.transport === 'frame';
  const allowed = (PropertiesService.getScriptProperties().getProperty('FRONTEND_ORIGIN') || '').split(',').map(value => value.trim());
  const origin = params.origin;
  if (bridge && (!/^https?:\/\/[^/\s]+$/.test(origin || '') || !/^[a-f0-9-]{36}$/.test(params.channel || ''))) {
    return json_({ ok: false, code: 'CONFIG', error: 'Origem do frontend inválida.' });
  }
  let result;
  try {
    if (bridge && !allowed.includes(origin)) fail_('CONFIG', 'A origem deste endereço não está configurada no Apps Script.');
    const body = bridge ? params.payload : e.postData.contents;
    if (!body || body.length > 220000) invalid_('Conteúdo inválido ou muito grande.');
    let request;
    try { request = JSON.parse(body); } catch (_) { invalid_('JSON inválido.'); }
    result = execute_(request, true);
  } catch (err) {
    result = error_(err);
  }
  if (!bridge) return json_(result);
  const data = JSON.stringify({ channel: params.channel, result }).replace(/</g, '\\u003c');
  const target = JSON.stringify(origin).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<script>window.top.postMessage(' + data + ',' + target + ');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function json_(response) {
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function execute_(request, post) {
  try {
    if (!request || typeof request.action !== 'string') invalid_('Operação inválida.');
    const actions = ['saveMonth','editShift','deactivateShift','exit','correctExit','cancelExit',
      'substitute','correctSubstitution','cancelSubstitution','absence','reportCoverageGap','cancelCoverageGap',
      'confirmArrival','correctArrival','cancelArrival'];
    const write = actions.includes(request.action);
    if (write && !post) invalid_('Use POST para gravações.');
    if (!write && !['units','month','day','unitDetail','history','dashboard','coverageReports','arrivalCandidates','technicians','health'].includes(request.action)) invalid_('Operação inválida.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail_('BUSY', 'Sistema ocupado. Tente novamente.');
    try {
      limit_(write);
      return { ok: true, version: API_VERSION, data: write ? mutate_(request) : read_(request) };
    } finally { lock.releaseLock(); }
  } catch (err) { return error_(err); }
}

function limit_(write) {
  const cache = CacheService.getScriptCache();
  const key = (write ? 'write-' : 'read-') + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0);
  if (count >= (write ? 45 : 240)) fail_('RATE_LIMIT', 'Limite temporário de requisições. Aguarde um minuto.');
  cache.put(key, String(count + 1), 120);
}

function invalid_(message) { fail_('VALIDATION', message); }
function fail_(code, message) { throw Object.assign(new Error(message), { code }); }
function error_(err) {
  if (err.code) return { ok: false, code: err.code, error: err.message };
  console.error(err.stack || err);
  return { ok: false, code: 'SHEETS', error: 'Não foi possível confirmar a operação no Google Sheets.' };
}

function unit_(unit) {
  if (!UNITS.includes(unit)) invalid_('Selecione uma unidade válida.');
  return unit;
}

function text_(value, max, required) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid_('Confira os campos obrigatórios e os limites de texto.');
  return value.trim();
}

function date_(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) invalid_('Data inválida.');
  const point = point_(value, '00:00');
  if (!Number.isFinite(point) || dateAt_(point) !== value) invalid_('Data inválida.');
  return value;
}

function month_(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) invalid_('Mês inválido.');
  return value;
}

function time_(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid_('Horário inválido.');
  return value;
}

function bookId_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_('CONFIG', 'Configure a planilha no Apps Script.');
  return id;
}

function values_(id, names) {
  const ranges = names.map(name => "'" + name + "'!A2:" + (name === HISTORY ? 'H' : 'N'));
  const response = Sheets.Spreadsheets.Values.batchGet(id, { ranges, valueRenderOption: 'UNFORMATTED_VALUE' });
  return response.valueRanges.map(range => range.values || []);
}

function decode_(cells) {
  const [id,date,tech,start,end,situation,substitute,subStart,subEnd,exit,reason,notes,updated,metadata] = cells;
  const meta = metadata ? JSON.parse(metadata) : {};
  return { id,date,tech,start,end,exit: exit || '',reason: meta.originalReason ?? (reason || ''),
    notes: meta.originalNotes ?? (notes || ''),updated,
    subs: (meta.subs || (substitute ? [{name:substitute,start:subStart,end:subEnd,reason,notes}] : []))
      .map((sub, index) => ({ ...sub, id: sub.id || 'legacy-' + index })),
    type: meta.type || 'shift', arrival: meta.arrival || '',
    absent: meta.absent || situation === 'Ausência', deleted: Boolean(meta.deleted), revision: meta.revision || 1 };
}

function encode_(row) {
  const sub = row.subs[row.subs.length - 1] || {};
  const situation = row.type === 'coverageGap' ? 'Sem cobertura informada'
    : row.exit ? 'Saída antecipada' : row.arrival || row.subs.some(item => item.arrival) ? 'CHEGADA CONFIRMADA'
      : row.subs.length ? 'Substituição' : row.absent ? 'Ausência' : 'Previsto';
  return [row.id,row.date,row.tech,row.start,row.end,situation,sub.name,sub.start,sub.end,row.exit,
    row.reason || sub.reason,row.notes || sub.notes,row.updated,
    JSON.stringify({type:row.type || 'shift',arrival:row.arrival || '',subs:row.subs,absent:row.absent,deleted:row.deleted,revision:row.revision,
      originalReason:row.reason,originalNotes:row.notes})];
}

function records_(cells) {
  return cells.flatMap((row, index) => row[0] ? [{ index: index + 1, record: decode_(row) }] : []);
}

function read_(p) {
  if (p.action === 'units') return UNITS;
  const id = bookId_();
  if (p.action === 'health') return { version: API_VERSION, spreadsheetId: id, unitCount: UNITS.length, timeZone: 'America/Sao_Paulo' };
  if (p.action === 'technicians') {
    const rows = records_(values_(id, [unit_(p.unit)])[0]).map(item => item.record).filter(row => row.type !== 'coverageGap' && !row.deleted);
    return [...new Set(rows.flatMap(row => [row.tech, ...row.subs.map(sub => sub.name)]))].filter(Boolean).sort();
  }
  if (p.action === 'arrivalCandidates') {
    const date = date_(p.date);
    const day = point_(date, '00:00');
    return records_(values_(id, [unit_(p.unit)])[0]).flatMap(item => {
      const row = item.record;
      if (row.deleted || row.type === 'coverageGap') return [];
      return plannedWork_(row).filter(worker => worker.from < day + 1440 && worker.to > day)
        .map(worker => ({ ...worker, unit: p.unit, id: row.id, revision: row.revision, date: row.date }));
    });
  }
  if (p.action === 'dashboard') {
    const now = localNow_(new Date());
    return { now, units: values_(id, UNITS).map((cells, index) => ({
      unit: UNITS[index], ...coverage_(records_(cells).map(item => item.record).filter(row => !row.deleted), now)
    })) };
  }
  if (p.action === 'history') {
    if (p.unit) unit_(p.unit);
    if (p.date) date_(p.date);
    if (p.operation && !OPS.includes(p.operation)) invalid_('Operação inválida.');
    const page = Number(p.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) invalid_('Página inválida.');
    const rows = values_(id, [HISTORY])[0].filter(row => row[0] && (!p.unit || row[1] === p.unit)
      && (!p.date || row[0].startsWith(p.date)) && (!p.operation || row[2] === p.operation)).reverse();
    return { total: rows.length, page, rows: rows.slice((page - 1) * 30, page * 30).map(row => ({
      at: row[0], unit: row[1], operation: row[2], id: row[3], before: JSON.parse(row[4]), after: JSON.parse(row[5])
    })) };
  }
  const unit = unit_(p.unit);
  if (p.action === 'coverageReports') {
    const date = date_(p.date);
    const from = point_(date, '00:00');
    return records_(values_(id, [unit])[0]).map(item => item.record).filter(row => {
      const period = interval_(row.date, row.start, row.end);
      return row.type === 'coverageGap' && !row.deleted && period.from < from + 1440 && period.to > from;
    }).sort((a,b) => (a.date + a.start).localeCompare(b.date + b.start));
  }
  if (p.action === 'unitDetail') {
    const date = date_(p.date);
    const start = date_(p.from);
    const end = date_(p.to);
    const first = point_(start, '00:00');
    const last = point_(end, '00:00') + 1440;
    if (first >= last || last - first > 366 * 1440) invalid_('Selecione um período de até 366 dias.');
    const rows = records_(values_(id, [unit])[0]).map(item => item.record).filter(row => !row.deleted)
      .sort((a,b) => (a.date + a.start).localeCompare(b.date + b.start));
    const now = localNow_(new Date());
    return { daily: coverage_(rows, date === now.slice(0,10) ? now : date + 'T00:00:00'),
      rows: rows.filter(row => {
        const period = interval_(row.date, row.start, row.end);
        return period.from < last && period.to > first;
      }) };
  }
  const period = p.action === 'day' ? date_(p.date) : month_(p.month);
  return records_(values_(id, [unit])[0]).map(item => item.record)
    .filter(row => !row.deleted && row.type !== 'coverageGap' && row.date.startsWith(period))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function shift_(input, month) {
  if (!input || typeof input !== 'object') invalid_('Plantão inválido.');
  const date = date_(input.date);
  if (!date.startsWith(month)) invalid_('O plantão deve pertencer ao mês selecionado.');
  return { date, tech: text_(input.tech, 120, true), start: time_(input.start), end: time_(input.end) };
}

function validateOccurrences_(row) {
  if (row.type === 'coverageGap') return;
  const planned = interval_(row.date, row.start, row.end);
  if (row.exit) {
    const exit = inShift_(row, row.exit);
    if (exit <= planned.from || exit >= planned.to) invalid_('A saída real deve ocorrer durante o plantão e antes do término.');
  }
  row.subs.forEach(sub => {
    if (sub.start === sub.end) invalid_('A substituição deve ter início e término diferentes.');
    const from = inShift_(row, sub.start);
    const duration = (point_(row.date, sub.end) - point_(row.date, sub.start) + 1440) % 1440;
    if (from + duration > planned.to) invalid_('A substituição deve estar dentro do plantão original.');
  });
  const substitutes = plannedWork_(row).filter(item => item.substitute);
  if (substitutes.some((item, index) => index && substitutes[index - 1].to > item.from)) {
    invalid_('Os intervalos de substituição deste plantão não podem se sobrepor.');
  }
  plannedWork_(row).forEach(worker => {
    if (worker.arrival && datetime_(worker.arrival) >= worker.to) invalid_('A chegada deve ocorrer antes do término efetivo da cobertura.');
  });
}

function findShift_(byId, input, month) {
  if (!input || typeof input.id !== 'string') invalid_('Plantão não informado.');
  const item = byId.get(input.id);
  if (!item || item.record.deleted || (month && !item.record.date.startsWith(month))) fail_('CONFLICT', 'Plantão indisponível. Recarregue a escala.');
  if (input.revision !== item.record.revision) fail_('CONFLICT', 'Plantão alterado em outra sessão. Recarregue a escala.');
  return item;
}

function changes_(p, existing, now) {
  const byId = new Map(existing.map(item => [item.record.id, item]));
  const changes = [];
  function add(item, fields, operation) {
    const before = item ? item.record : null;
    const base = before || { id: Utilities.getUuid(), subs: [], arrival: '', absent: false, deleted: false, exit: '', reason: '', notes: '', revision: 0 };
    const after = { ...base, correction: '', ...fields, updated: now, revision: base.revision + 1 };
    validateOccurrences_(after);
    changes.push({ index: item ? item.index : null, before, after, operation });
  }
  if (p.action === 'reportCoverageGap') {
    const fields = { type: 'coverageGap', tech: '', date: date_(p.date), start: time_(p.start),
      end: time_(p.end), reason: text_(p.reason, 400, true), notes: text_(p.notes, 800, false) };
    const period = interval_(fields.date, fields.start, fields.end);
    if (existing.some(item => {
      const row = item.record;
      const other = interval_(row.date, row.start, row.end);
      return row.type === 'coverageGap' && !row.deleted && period.from < other.to && period.to > other.from;
    })) invalid_('Já existe um registro de falta de cobertura neste intervalo. Consulte os registros abaixo.');
    add(null, fields, 'Unidade sem cobertura');
    return changes;
  }
  if (p.action === 'cancelCoverageGap') {
    const item = findShift_(byId, p);
    if (item.record.type !== 'coverageGap') invalid_('Registro de falta de cobertura inválido.');
    add(item, { deleted: true, correction: text_(p.correction, 400, true) }, 'Cancelamento de falta de cobertura');
    return changes;
  }
  if (['saveMonth','editShift','deactivateShift'].includes(p.action)) {
    const month = month_(p.month);
    const rows = p.action === 'editShift' ? [p.shift] : p.action === 'deactivateShift' ? [] : p.rows;
    const remove = p.action === 'deactivateShift' ? [p.shift] : p.remove || [];
    if (!Array.isArray(rows) || !Array.isArray(remove) || rows.length + remove.length > 1000) invalid_('Envie até 1.000 alterações por vez.');
    const touched = new Set();
    function current(input) {
      const item = findShift_(byId, input, month);
      if (item.record.type === 'coverageGap') invalid_('Use a tela Sem cobertura para alterar esta ocorrência.');
      if (touched.has(input.id)) invalid_('Um mesmo plantão foi enviado mais de uma vez.');
      touched.add(input.id);
      return item;
    }
    rows.forEach(input => {
      const fields = shift_(input, month);
      const item = input.id ? current(input) : null;
      if (p.action === 'editShift' && !item) invalid_('Plantão não informado.');
      if (!item || Object.keys(fields).some(key => fields[key] !== item.record[key])) add(item, fields, item ? 'Alteração' : 'Cadastro');
    });
    remove.forEach(input => add(current(input), { deleted: true }, 'Exclusão lógica'));
    const ids = new Set(changes.map(change => change.after.id));
    const signature = row => JSON.stringify([row.date,row.tech.toLocaleLowerCase('pt-BR'),row.start,row.end]);
    const seen = new Set(existing.filter(item => !item.record.deleted && !ids.has(item.record.id)).map(item => signature(item.record)));
    changes.filter(change => !change.after.deleted).forEach(change => {
      const key = signature(change.after);
      if (seen.has(key)) fail_('CONFLICT', 'Há um plantão idêntico para o mesmo técnico.');
      seen.add(key);
    });
    return changes;
  }
  const item = findShift_(byId, p);
  const row = item.record;
  if (row.type === 'coverageGap') invalid_('Selecione um plantão de técnico.');
  if (['confirmArrival','correctArrival','cancelArrival'].includes(p.action)) {
    const person = plannedWork_(row).find(worker => (worker.subId || '') === (p.subId || ''));
    if (!person) invalid_('Técnico indisponível para confirmar chegada neste plantão.');
    const canceling = p.action === 'cancelArrival';
    const correcting = p.action !== 'confirmArrival';
    if (correcting ? !person.arrival : person.arrival) fail_('CONFLICT', 'A confirmação deste técnico mudou. Recarregue os plantões.');
    const correction = correcting ? text_(p.correction, 400, true) : '';
    const arrival = canceling ? '' : text_(p.arrival, 16, true);
    if (arrival) {
      const minute = datetime_(arrival);
      if (arrival.slice(0,10) < row.date || minute >= person.to) invalid_('A chegada deve ocorrer na data do plantão ou no dia seguinte, antes do término da cobertura.');
      if (minute > datetime_(now.slice(0,16))) invalid_('A chegada real não pode estar no futuro.');
    }
    const fields = p.subId ? { subs: row.subs.map(sub => sub.id === p.subId ? { ...sub, arrival } : sub) } : { arrival };
    add(item, { ...fields, correction }, canceling ? 'Cancelamento de chegada' : correcting ? 'Correção de chegada' : 'Chegada confirmada');
    return changes;
  }
  if (p.action === 'cancelExit' || p.action === 'cancelSubstitution') {
    const correction = text_(p.correction, 400, true);
    if (p.action === 'cancelExit') {
      if (!row.exit) fail_('CONFLICT', 'Este plantão não possui saída registrada.');
      add(item, { exit: '', reason: '', notes: '', correction }, 'Cancelamento de saída');
    } else {
      if (!row.subs.some(sub => sub.id === p.subId)) fail_('CONFLICT', 'Substituição indisponível. Recarregue os plantões.');
      add(item, { subs: row.subs.filter(sub => sub.id !== p.subId), correction }, 'Cancelamento de substituição');
    }
    return changes;
  }
  const reason = text_(p.reason, 400, true);
  const notes = text_(p.notes, 800, false);
  if (p.action === 'exit' || p.action === 'correctExit') {
    const correcting = p.action === 'correctExit';
    if (row.absent || (correcting ? !row.exit : row.exit)) fail_('CONFLICT', 'A situação deste plantão mudou. Recarregue os plantões.');
    const correction = correcting ? text_(p.correction, 400, true) : '';
    add(item, { exit: time_(p.exit), reason, notes, correction }, correcting ? 'Correção de saída' : 'Saída antecipada');
  } else if (p.action === 'absence') {
    if (row.exit || row.absent) fail_('CONFLICT', 'Já existe uma ocorrência de ausência ou saída neste plantão.');
    add(item, { absent: true, reason, notes }, 'Ausência');
  } else {
    const correcting = p.action === 'correctSubstitution';
    if (correcting && !row.subs.some(sub => sub.id === p.subId)) fail_('CONFLICT', 'Substituição indisponível. Recarregue os plantões.');
    if (!correcting && row.subs.length >= 15) invalid_('Limite de substituições atingido neste plantão.');
    const sub = { ...(correcting ? row.subs.find(previous => previous.id === p.subId) : {}),
      id: correcting ? p.subId : Utilities.getUuid(),
      name: text_(p.name, 120, true), start: time_(p.start), end: time_(p.end), reason, notes };
    if (p.originalAbsent !== true && p.originalAbsent !== false) invalid_('Informe se o técnico original esteve ausente.');
    if (p.originalAbsent && row.exit) invalid_('O titular já possui saída registrada neste plantão.');
    if (row.subs.length && p.originalAbsent !== row.absent) invalid_('A situação do titular foi definida na primeira substituição.');
    const correction = correcting ? text_(p.correction, 400, true) : '';
    const subs = correcting ? row.subs.map(previous => previous.id === p.subId ? sub : previous) : [...row.subs, sub];
    add(item, { subs, absent: row.absent || p.originalAbsent, correction,
      ...(p.originalAbsent && !row.absent ? { reason, notes } : {}) },
      correcting ? 'Correção de substituição' : 'Substituição');
  }
  return changes;
}

function cells_(values) {
  return { values: values.map(value => ({ userEnteredValue: { stringValue: String(value ?? '') } })) };
}

function mutate_(p) {
  const unit = unit_(p.unit);
  if (typeof p.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(p.requestId)) invalid_('Identificador da operação inválido.');
  const id = bookId_();
  const digest = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(p)));
  const [data, history] = values_(id, [unit, HISTORY]);
  const replay = history.filter(row => row[6] === p.requestId);
  if (replay.length) {
    if (replay.some(row => row[7] !== digest)) fail_('CONFLICT', 'Identificador da operação já utilizado.');
    return { changed: replay.length, replay: true };
  }
  const now = localNow_(new Date());
  const changes = changes_(p, records_(data), now);
  if (!changes.length) return { changed: 0 };
  const sheets = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties(sheetId,title))' }).sheets;
  const sheetId = sheets.find(sheet => sheet.properties.title === unit).properties.sheetId;
  const historyId = sheets.find(sheet => sheet.properties.title === HISTORY).properties.sheetId;
  const requests = changes.filter(change => change.before).map(change => ({
    updateCells: { start: { sheetId, rowIndex: change.index, columnIndex: 0 },
      rows: [cells_(encode_(change.after))], fields: 'userEnteredValue' }
  }));
  const inserted = changes.filter(change => !change.before).map(change => cells_(encode_(change.after)));
  if (inserted.length) requests.push({ appendCells: { sheetId, rows: inserted, fields: 'userEnteredValue' } });
  const audit = changes.map(change => cells_([now,unit,change.operation,change.after.id,
    JSON.stringify(change.before),JSON.stringify(change.after),p.requestId,digest]));
  requests.push({ appendCells: { sheetId: historyId, rows: audit, fields: 'userEnteredValue' } });
  Sheets.Spreadsheets.batchUpdate({ requests }, id);
  return { changed: changes.length };
}
