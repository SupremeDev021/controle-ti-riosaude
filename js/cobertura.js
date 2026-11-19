import { api, retryableMutation } from './api.js';
import { displayDate, empty, escape, formData, heading, options, shiftTime, today, units, zone } from './utils.js';

export function renderCoverageReport(root, params, notify) {
  const unit = units.includes(params.get('unit')) ? params.get('unit') : units[0];
  const now = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  root.innerHTML = heading('Informar unidade sem cobertura', 'Registre o período em que a unidade está sem atendimento de TI.')
    + '<form class="surface occurrence-form"><div class="fields">'
    + '<label>Unidade<select name="unit">' + options(units, unit) + '</select></label>'
    + '<label>Data de início<input name="date" type="date" required value="' + escape(params.get('date') || today()) + '"></label>'
    + '<label>Sem cobertura a partir de<input name="start" type="time" required value="' + now + '"></label>'
    + '<label>Sem cobertura até<input name="end" type="time" required></label>'
    + '<label class="wide">Motivo<input name="reason" maxlength="400" required></label>'
    + '<label class="wide">Observações (opcional)<textarea name="notes" maxlength="800" rows="3"></textarea></label>'
    + '</div><p class="help">Durante este período, o dashboard mostrará a unidade sem cobertura, inclusive se houver técnicos previstos na escala. Um término igual ou anterior ao início corresponde ao dia seguinte.</p>'
    + '<div class="form-footer"><button class="button primary">Registrar unidade sem cobertura</button></div></form>'
    + '<section class="surface stacked"><div class="section-heading"><h2>Registros para a data selecionada</h2>'
    + '<button class="button secondary" type="button" data-reload>Atualizar</button></div>'
    + '<div data-reports></div></section>';
  const form = root.querySelector('form');
  const reports = root.querySelector('[data-reports]');
  const reload = root.querySelector('[data-reload]');
  const submit = form.querySelector('button');
  const save = retryableMutation('reportCoverageGap');
  const cancelSave = retryableMutation('cancelCoverageGap');
  let version = 0;
  let busy = false;

  function disable(value) {
    busy = value;
    [...form.elements].forEach(control => { control.disabled = value; });
    reload.disabled = value;
    reports.querySelectorAll('button, input').forEach(control => { control.disabled = value; });
  }
  async function load() {
    const request = ++version;
    const { unit, date } = formData(form);
    reload.disabled = true;
    reports.innerHTML = empty('Consultando os registros…');
    try {
      if (!date) { reports.innerHTML = empty('Selecione a data de início.'); return; }
      const rows = await api('coverageReports', { unit, date });
      if (request !== version || !root.contains(form)) return;
      reports.innerHTML = rows.length ? rows.map(row =>
        '<article class="stacked"><span class="status uncovered">Sem cobertura informada</span><p>'
        + displayDate(row.date) + ' · ' + shiftTime(row) + '</p><p>' + escape(row.reason) + '</p>'
        + (row.notes ? '<p class="help">' + escape(row.notes) + '</p>' : '')
        + '<div class="fields"><label class="wide">Justificativa para cancelar este registro<input maxlength="400" data-correction></label>'
        + '</div><div class="form-footer"><button type="button" class="button secondary" data-id="' + escape(row.id)
        + '">Cancelar registro</button></div></article>').join('') : empty('Nenhuma falta de cobertura informada para esta data.');
      reports.querySelectorAll('[data-id]').forEach(button => {
        button.onclick = async () => {
          if (busy) return;
          const row = rows.find(item => item.id === button.dataset.id);
          const input = button.closest('article').querySelector('input');
          if (!input.value.trim()) { input.setCustomValidity('Informe a justificativa do cancelamento.'); input.reportValidity(); return; }
          const payload = { unit, id: row.id, revision: row.revision, correction: input.value.trim() };
          disable(true);
          try {
            await cancelSave(payload);
            notify('Cancelamento confirmado no Google Sheets.');
            window.dispatchEvent(new Event('schedule-saved'));
          } catch (error) { notify(error.message, 'error'); disable(false); return; }
          disable(false);
          await load();
        };
      });
      reports.querySelectorAll('[data-correction]').forEach(input => { input.oninput = () => input.setCustomValidity(''); });
    } catch (error) {
      if (request === version && root.contains(form)) reports.innerHTML = empty(error.message);
    } finally { if (request === version) reload.disabled = busy; }
  }
  form.elements.unit.onchange = load;
  form.elements.date.onchange = load;
  reload.onclick = load;
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || submit.disabled) return;
    const payload = formData(form);
    disable(true);
    try {
      await save(payload);
      notify('Falta de cobertura confirmada no Google Sheets.');
      window.dispatchEvent(new Event('schedule-saved'));
      form.elements.reason.value = '';
      form.elements.notes.value = '';
    } catch (error) { notify(error.message, 'error'); disable(false); return; }
    disable(false);
    await load();
  };
  load();
}
