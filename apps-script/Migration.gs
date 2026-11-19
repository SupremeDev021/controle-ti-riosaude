// Execute once in the Apps Script editor to consolidate the existing operational data.
function migrateOperationalData() {
  const properties = PropertiesService.getScriptProperties();
  const sourceId = properties.getProperty('SPREADSHEET_ID');
  const targetId = '1Nkxk7jcGPQaiN_SPcQoNi4VbRfScy2tRK7kMmI0bU48';
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    setupSheets_(sourceId);
    if (sourceId === targetId) {
      console.log('A planilha de produção já está configurada.');
      return;
    }
    setupSheets_(targetId);
    const names = [...UNITS, HISTORY];
    const source = values_(sourceId, names);
    const target = values_(targetId, names);
    const sheets = Sheets.Spreadsheets.get(targetId, { fields: 'sheets(properties(sheetId,title))' }).sheets;
    const requests = [];
    const summary = [];
    names.forEach((name, index) => {
      const existing = new Map(target[index].filter(row => row[0]).map(row => [
        name === HISTORY ? JSON.stringify(row) : row[0], row
      ]));
      const missing = source[index].filter(row => {
        if (!row[0]) return false;
        const key = name === HISTORY ? JSON.stringify(row) : row[0];
        const previous = existing.get(key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
          throw new Error('O ID ' + key + ' possui versões diferentes em ' + name + '. Migração interrompida para revisão.');
        }
        return !previous;
      });
      if (missing.length) requests.push({ appendCells: {
        sheetId: sheets.find(sheet => sheet.properties.title === name).properties.sheetId,
        rows: missing.map(cells_), fields: 'userEnteredValue'
      } });
      summary.push({ unit: name, copied: missing.length, previous: target[index].length });
    });
    if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests }, targetId);
    const verified = values_(targetId, names);
    names.forEach((name, index) => {
      const rows = new Set(verified[index].map(row => JSON.stringify(row)));
      if (source[index].some(row => row[0] && !rows.has(JSON.stringify(row)))) {
        throw new Error('A verificação da migração falhou em ' + name + '. A origem permanece configurada.');
      }
    });
    properties.setProperty('SPREADSHEET_ID', targetId);
    console.log(JSON.stringify({ sourceId, targetId, verified: true, sheets: summary }));
  } finally { lock.releaseLock(); }
}
