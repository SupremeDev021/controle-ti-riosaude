import { api, retryableMutation } from './api.js';
import { openMonthBuilder, shiftKey } from './montagem.js';
import { displayDate, empty, escape, heading, icon, navigate, options, stepMonth, today, units } from './utils.js';

export function renderScale(root, params, notify) {
  const unit = units.includes(params.get('unit')) ? params.get('unit') : units[0];
  const month = params.get('month') || today().slice(0, 7);
  const day = params.get('date') || '';
  root.innerHTML = heading('Alterar escala', 'Cadastre ou edite os plantões de um mês em uma única tabela.')
    + '<form id="scale-filter" class="surface filters"><label>Unidade<select name="unit">' + options(units, unit)
    + '</select></label><label>Mês e ano<input type="month" name="month" required value="' + escape(month)
    + '"></label><button class="button secondary">Consultar</button></form><div id="scale-data"></div>';
  const display = root.querySelector('#scale-data');
  const filter = root.querySelector('#scale-filter');
  filter.onsubmit = (event) => {
    event.preventDefault();
    navigate('escala', new FormData(filter));
  };
  filter.onchange = () => {
    if (filter.reportValidity()) navigate('escala', new FormData(filter));
  };
  display.innerHTML = empty('Consultando a escala…');
  api('month', { unit, month }).then(rows => editor(display, { unit, month, day, rows }, notify))
    .catch(error => { display.innerHTML = empty(error.message); });
}

function editor(display, { unit, month, day, rows }, notify) {
  const save = retryableMutation('saveMonth');
  let removed = [];
  const source = new Map(rows.map(row => [row.id, row]));
  display.innerHTML = '<form class="surface" id="editor"><div class="section-heading"><div><h2>Plantões do mês</h2>'
    + '<p>' + escape(unit) + ' · ' + escape(month.split('-').reverse().join('/')) + '</p></div>'
    + '<div class="actions"><button type="button" data-build class="button primary">Montar Escala do Mês</button>'
    + '<label>Copiar do mês<input type="month" name="copyMonth" value="' + stepMonth(month, -1) + '"></label>'
    + '<button type="button" data-copy class="button secondary">Copiar Escala Anterior</button>'
    + '<button type="button" data-add class="button secondary">+ Adicionar técnico</button></div></div>'
    + '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Técnico</th><th>Entrada</th><th>Saída</th><th>Ações</th></tr></thead><tbody></tbody></table></div>'
    + '<div class="form-footer"><span>Uma saída igual ou anterior à entrada termina no dia seguinte.</span>'
    + '<button class="button primary">' + icon('check') + ' Salvar escala mensal</button></div></form>';
  const form = display.querySelector('form');
  const table = form.querySelector('tbody');
  function renderEmpty() {
    if (!table.querySelector('tr[data-shift]')) table.innerHTML = '<tr class="placeholder"><td colspan="5">Nenhum plantão cadastrado neste mês.</td></tr>';
  }
  function add(row = {}) {
    table.querySelector('.placeholder')?.remove();
    const tr = document.createElement('tr');
    tr.dataset.shift = row.id || '';
    tr.innerHTML = '<td><input aria-label="Data do plantão" name="date" type="date" min="' + month + '-01" required value="' + escape(row.date || day || month + '-01') + '"></td>'
      + '<td><input aria-label="Nome do técnico" name="tech" maxlength="120" placeholder="Nome do técnico" required value="' + escape(row.tech) + '"></td>'
      + '<td><input aria-label="Entrada" name="start" type="time" required value="' + escape(row.start) + '"></td>'
      + '<td><input aria-label="Saída" name="end" type="time" required value="' + escape(row.end) + '"></td>'
      + '<td><button type="button" class="text-button danger">Excluir</button></td>';
    tr.querySelector('button').onclick = () => {
      if (row.id) removed.push({ id: row.id, revision: row.revision });
      tr.remove();
      renderEmpty();
    };
    table.append(tr);
    return tr;
  }
  function values(tr) {
    return Object.fromEntries(Array.from(tr.querySelectorAll('input'), input => [input.name,input.value]));
  }
  rows.forEach(add);
  renderEmpty();
  if (day) {
    const match = Array.from(table.querySelectorAll('input[name=date]')).find(input => input.value === day);
    if (match) match.focus();
    else add({ date: day }).querySelector('[name=tech]').focus();
  }
  form.querySelector('[data-add]').onclick = () => add().querySelector('[name=tech]').focus();
  form.querySelector('[data-build]').onclick = () => openMonthBuilder(display, {
    unit, month,
    existing: () => [...source.values(), ...Array.from(table.querySelectorAll('[data-shift]'), values)].filter(row => row.tech),
    addDrafts: drafts => drafts.forEach(add),
    saveMonth: () => form.requestSubmit(),
    onSaved: async drafts => {
      const keys = new Set(drafts.map(shiftKey));
      const fresh = await api('month', { unit, month });
      fresh.filter(row => keys.has(shiftKey(row)) && !source.has(row.id)).forEach(row => {
        source.set(row.id, row);
        add(row);
      });
    }
  }, notify);
  form.querySelector('[data-copy]').onclick = async ({ currentTarget: button }) => {
    button.disabled = true;
    try {
      const previous = await api('month', { unit, month: form.elements.copyMonth.value || stepMonth(month, -1) });
      const signatures = new Set(Array.from(table.querySelectorAll('[data-shift]'), tr => JSON.stringify(values(tr))));
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
      let added = 0;
      let skipped = 0;
      previous.forEach(row => {
        if (Number(row.date.slice(-2)) > last) { skipped++; return; }
        const draft = { date: month + row.date.slice(7), tech: row.tech, start: row.start, end: row.end };
        const key = JSON.stringify(draft);
        if (signatures.has(key)) { skipped++; return; }
        add(draft);
        signatures.add(key);
        added++;
      });
      notify(added + ' plantão(ões) copiado(s) para revisão' + (skipped ? '. ' + skipped + ' ignorado(s) por duplicidade ou dia inexistente.' : '.'));
    } catch (error) { notify(error.message, 'error'); }
    finally { button.disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const changed = Array.from(table.querySelectorAll('[data-shift]')).flatMap(tr => {
      const draft = values(tr);
      const original = source.get(tr.dataset.shift);
      if (!original) return [draft];
      if (Object.keys(draft).every(key => draft[key] === original[key])) return [];
      return [{ ...draft, id: original.id, revision: original.revision }];
    });
    const outside = changed.find(row => !row.date.startsWith(month));
    if (outside) { notify('A data ' + displayDate(outside.date) + ' fica fora do mês selecionado.', 'error'); return; }
    if (!changed.length && !removed.length) { notify('Nenhuma alteração para salvar.'); return; }
    const controls = [...form.elements];
    controls.forEach(item => { item.disabled = true; });
    try {
      const result = await save({ unit, month, rows: changed, remove: removed });
      removed = [];
      notify(result.changed + ' alteração(ões) confirmada(s) no Google Sheets.');
      window.dispatchEvent(new Event('schedule-saved'));
      try {
        editor(display, { unit, month, day: '', rows: await api('month', { unit, month }) }, notify);
      } catch (error) {
        display.innerHTML = empty('Escala salva. Use Consultar para recarregar os plantões. ' + error.message);
      }
    } catch (error) {
      notify(error.message, 'error');
      controls.forEach(item => { item.disabled = false; });
    }
  };
}
