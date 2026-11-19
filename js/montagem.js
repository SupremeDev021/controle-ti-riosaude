import { api, retryableMutation } from './api.js';
import { displayDate, escape, monthName, options } from './utils.js';

export function monthDates(month) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const days = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => month + '-' + String(index + 1).padStart(2, '0'));
}

export function shiftKey(row) {
  return JSON.stringify([row.date, row.tech.trim().toLocaleLowerCase('pt-BR'), row.start, row.end]);
}

export function openMonthBuilder(host, { unit, month, existing, addDrafts, onSaved, saveMonth }, notify) {
  host.querySelector('dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'month-builder';
  dialog.innerHTML = '<form><div class="section-heading"><div><h2>Montar escala do mês</h2><p>'
    + escape(unit + ' · ' + monthName(month)) + '</p></div><button type="button" class="button secondary" data-close>Fechar</button></div>'
    + '<div class="fields"><label class="wide">Técnico<input name="tech" maxlength="120" required list="technician-names" placeholder="Selecione ou digite um novo técnico">'
    + '<datalist id="technician-names"></datalist></label><label>Entrada padrão<input name="start" type="time" required value="07:00"></label>'
    + '<label>Saída padrão<input name="end" type="time" required value="19:00"></label></div>'
    + '<div class="actions builder-actions"><button type="button" class="button secondary" data-new>Adicionar Técnico</button>'
    + '<button type="button" class="button secondary" data-select>Selecionar Datas</button>'
    + '<button type="button" class="button secondary" data-apply>Aplicar Horário</button>'
    + '<button type="button" class="button secondary" data-clear>Limpar Seleção</button></div>'
    + '<div class="builder-calendar" role="group" aria-label="Dias de ' + escape(monthName(month)) + '">'
    + ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => '<span class="builder-weekday">' + day + '</span>').join('')
    + '<span aria-hidden="true" style="display:contents">' + Array.from({ length: new Date(month + '-01T12:00:00Z').getUTCDay() }, () => '<span></span>').join('') + '</span>'
    + monthDates(month).map(date => '<button type="button" class="builder-day" data-day="' + date + '" aria-pressed="false" aria-label="' + displayDate(date)
      + '">' + Number(date.slice(-2)) + '</button>').join('') + '</div>'
    + '<h3>Plantões selecionados</h3><div class="table-wrap"><table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th></tr></thead><tbody></tbody></table></div>'
    + '<p class="help">Os horários podem ser ajustados na prévia. Para editar um plantão já salvo, use a tabela da escala mensal.</p>'
    + '<div class="form-footer"><button type="button" class="button secondary" data-month>Salvar Escala Mensal</button>'
    + '<button type="submit" class="button primary">Salvar Escala do Técnico</button></div></form>';
  host.append(dialog);
  const form = dialog.querySelector('form');
  const selected = new Map();
  const table = form.querySelector('tbody');
  const save = retryableMutation('saveMonth');
  let busy = false;
  function capture() {
    table.querySelectorAll('[data-date]').forEach(tr => {
      selected.set(tr.dataset.date, { date: tr.dataset.date, start: tr.querySelector('[name=dayStart]').value,
        end: tr.querySelector('[name=dayEnd]').value });
    });
  }
  function paint() {
    form.querySelectorAll('[data-day]').forEach(button => {
      button.setAttribute('aria-pressed', String(selected.has(button.dataset.day)));
    });
    table.innerHTML = [...selected.values()].sort((a,b) => a.date.localeCompare(b.date)).map(row =>
      '<tr data-date="' + row.date + '"><td>' + displayDate(row.date) + '</td><td><input name="dayStart" type="time" required aria-label="Entrada em '
      + displayDate(row.date) + '" value="' + escape(row.start) + '"></td><td><input name="dayEnd" type="time" required aria-label="Saída em '
      + displayDate(row.date) + '" value="' + escape(row.end) + '"></td></tr>').join('')
      || '<tr><td colspan="3">Selecione os dias do plantão.</td></tr>';
  }
  form.querySelectorAll('[data-day]').forEach(button => {
    button.onclick = () => {
      capture();
      const date = button.dataset.day;
      if (selected.has(date)) selected.delete(date);
      else selected.set(date, { date, start: form.elements.start.value, end: form.elements.end.value });
      paint();
    };
  });
  form.querySelector('[data-new]').onclick = () => { form.elements.tech.value = ''; form.elements.tech.focus(); };
  form.querySelector('[data-select]').onclick = () => form.querySelector('[data-day]').focus();
  form.querySelector('[data-apply]').onclick = () => {
    selected.forEach((row,date) => selected.set(date, { ...row, start: form.elements.start.value, end: form.elements.end.value }));
    paint();
  };
  form.querySelector('[data-clear]').onclick = () => { selected.clear(); paint(); };
  form.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.onclose = () => { if (!busy) dialog.remove(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function drafts() {
    if (!form.reportValidity()) return null;
    capture();
    const seen = new Set(existing().map(shiftKey));
    const rows = [...selected.values()].map(row => ({ ...row, tech: form.elements.tech.value.trim() }))
      .filter(row => {
        const key = shiftKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (!rows.length) { notify('Selecione plantões novos. Plantões idênticos já cadastrados são ignorados.', 'error'); return null; }
    return rows;
  }
  form.querySelector('[data-month]').onclick = () => {
    const rows = drafts();
    if (!rows) return;
    addDrafts(rows);
    dialog.close();
    saveMonth();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const rows = drafts();
    if (!rows) return;
    busy = true;
    [...form.elements].forEach(control => { control.disabled = true; });
    try {
      await save({ unit, month, rows, remove: [] });
    } catch (error) {
      notify(error.message, 'error');
      [...form.elements].forEach(control => { control.disabled = false; });
      busy = false;
      return;
    }
    notify('Escala do técnico confirmada no Google Sheets.');
    window.dispatchEvent(new Event('schedule-saved'));
    try { await onSaved(rows); }
    catch (error) { notify('A escala foi salva. Consulte novamente para carregar os novos IDs. ' + error.message, 'error'); }
    busy = false;
    dialog.close();
  };
  paint();
  const known = [...new Set(existing().map(row => row.tech))].filter(Boolean);
  form.querySelector('datalist').innerHTML = options(known);
  api('technicians', { unit }).then(names => {
    if (dialog.isConnected) form.querySelector('datalist').innerHTML = options(names);
  }).catch(error => console.error('Falha ao consultar técnicos', error));
  dialog.showModal();
  form.elements.tech.focus();
}
