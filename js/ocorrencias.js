import { api, retryableMutation } from './api.js';
import { displayDate, escape, formData, heading, options, shiftTime, today, units } from './utils.js';

export function renderOccurrence(root, params, notify, page) {
  const swap = page === 'troca';
  const selectedUnit = units.includes(params.get('unit')) ? params.get('unit') : units[0];
  root.innerHTML = heading(swap ? 'Informar troca' : 'Informar saída',
    swap ? 'Registre ou corrija as substituições de um plantão.' : 'Registre ou corrija o horário real de saída de um técnico escalado.')
    + '<form class="surface occurrence-form"><div class="section-heading"><h2>Dados da ocorrência</h2></div><div class="fields">'
    + '<label>Unidade<select name="unit">' + options(units, selectedUnit) + '</select></label>'
    + '<label>Data de início do plantão<input type="date" required name="date" value="' + escape(params.get('date') || today()) + '"></label>'
    + '<label class="wide">' + (swap ? 'Técnico originalmente escalado' : 'Técnico escalado')
    + '<select name="id" required disabled><option value="">Consultando escala…</option></select></label>'
    + (swap ? '<label class="wide">Ocorrência<select name="kind"><option value="substitute">Substituição</option><option value="absence">Ausência sem substituto</option></select></label>'
      + '<label class="wide" data-existing>Substituição<select name="subId"><option value="">Nova substituição</option></select></label>'
      + '<fieldset class="fields wide" data-sub><legend>Dados do substituto</legend>'
      + '<label class="wide">Nome do substituto<input name="name" required maxlength="120"></label>'
      + '<label>Início do substituto<input name="start" type="time" required></label>'
      + '<label>Término do substituto<input name="end" type="time" required></label>'
      + '<label class="check-field wide"><input type="checkbox" name="originalAbsent" checked> Técnico original ausente durante todo o plantão</label>'
      + '<p class="help wide">Desmarque se o titular trabalhou no início. Registre a saída antecipada quando ele tiver saído antes da chegada do substituto.</p></fieldset>'
      : '<label>Saída prevista<input name="planned" readonly placeholder="Selecione o técnico"></label>'
      + '<label>Saída real<input name="exit" type="time" required></label>')
    + '<label class="wide">Motivo<input name="reason" maxlength="400" required></label>'
    + '<label class="wide">Observações <span class="help">(opcional)</span><textarea rows="3" maxlength="800" name="notes"></textarea></label>'
    + '<label class="wide" data-correction hidden>Justificativa da correção ou cancelamento<input name="correction" maxlength="400" disabled></label>'
    + '</div><p class="help" data-period aria-live="polite"></p><p class="form-message" aria-live="polite"></p>'
    + '<div class="form-footer"><button type="button" class="button secondary" data-reload>Recarregar plantões</button>'
    + '<button type="button" class="button secondary" data-cancel hidden>Cancelar ocorrência</button>'
    + '<button type="submit" class="button primary" disabled>' + (swap ? 'Confirmar troca' : 'Registrar saída') + '</button></div></form>';
  const form = root.querySelector('form');
  const fields = form.elements;
  const submit = form.querySelector('[type=submit]');
  const cancel = form.querySelector('[data-cancel]');
  const reload = form.querySelector('[data-reload]');
  const select = fields.namedItem('id');
  const message = form.querySelector('.form-message');
  const period = form.querySelector('[data-period]');
  const saves = Object.fromEntries(['exit','correctExit','cancelExit','substitute','correctSubstitution','cancelSubstitution','absence']
    .map(action => [action, retryableMutation(action)]));
  let records = [];
  let loading = 0;
  let saving = false;
  const selected = () => records.find(row => row.id === select.value);
  const substitution = () => selected()?.subs.find(sub => sub.id === fields.subId?.value);
  const correcting = () => Boolean(swap ? substitution() : selected()?.exit);

  function update() {
    const row = selected();
    const kind = swap ? fields.kind.value : 'exit';
    const correction = correcting();
    if (swap) {
      const isSub = kind === 'substitute';
      const group = form.querySelector('[data-sub]');
      group.hidden = !isSub;
      group.disabled = !isSub;
      form.querySelector('[data-existing]').hidden = !isSub;
      fields.subId.disabled = !isSub || !row;
      fields.originalAbsent.disabled = Boolean(row?.exit || row?.absent || row?.subs.length);
      fields.originalAbsent.checked = Boolean(row?.absent || !(row?.exit || row?.subs.length));
      submit.textContent = kind === 'absence' ? 'Registrar ausência' : correction ? 'Salvar correção da troca' : 'Confirmar troca';
    } else {
      fields.planned.value = row ? row.end + (row.end <= row.start ? ' (+1 dia)' : '') : '';
      submit.textContent = correction ? 'Salvar correção da saída' : 'Registrar saída';
    }
    form.querySelector('[data-correction]').hidden = !correction;
    fields.correction.disabled = !correction;
    fields.correction.required = correction;
    cancel.hidden = !correction || (swap && kind !== 'substitute');
    submit.disabled = saving || !row || Boolean((kind === 'exit' || kind === 'absence') && row.absent)
      || Boolean(kind === 'absence' && row.exit);
    period.textContent = '';
    if (row) {
      const end = new Date(row.date + 'T00:00:00Z');
      if (row.end <= row.start) end.setUTCDate(end.getUTCDate() + 1);
      period.textContent = 'Plantão de ' + displayDate(row.date) + ' às ' + row.start + ' até '
        + displayDate(end.toISOString().slice(0,10)) + ' às ' + row.end + '.';
    }
  }

  function fillOccurrence() {
    const row = selected();
    const sub = swap ? substitution() : null;
    if (swap) {
      fields.name.value = sub?.name || '';
      fields.start.value = sub?.start || '';
      fields.end.value = sub?.end || '';
    } else fields.exit.value = row?.exit || '';
    fields.reason.value = swap ? sub?.reason || '' : row?.exit ? row.reason : '';
    fields.notes.value = swap ? sub?.notes || '' : row?.exit ? row.notes : '';
    fields.correction.value = '';
    update();
  }

  function selectShift() {
    if (swap) fields.subId.innerHTML = '<option value="">Nova substituição</option>' + (selected()?.subs || []).map(sub =>
      '<option value="' + escape(sub.id) + '">Corrigir · ' + escape(sub.name + ' · ' + shiftTime(sub)) + '</option>').join('');
    fillOccurrence();
  }

  async function load(keepId = '') {
    const version = ++loading;
    const { unit, date } = formData(form);
    select.innerHTML = '<option value="">Consultando escala…</option>';
    select.disabled = true;
    records = [];
    message.textContent = '';
    reload.disabled = true;
    selectShift();
    try {
      if (!date) return;
      const result = await api('day', { unit, date });
      if (version !== loading || !root.contains(form)) return;
      records = result;
      select.innerHTML = '<option value="">' + (records.length ? 'Selecione um plantão' : 'Nenhum plantão cadastrado') + '</option>'
        + records.map(row => '<option value="' + escape(row.id) + '">' + escape(row.tech + ' · ' + shiftTime(row)) + '</option>').join('');
      select.disabled = !records.length;
      if (records.some(row => row.id === keepId)) select.value = keepId;
      selectShift();
    } catch (error) {
      if (version !== loading) return;
      select.innerHTML = '<option value="">Escala indisponível</option>';
      message.textContent = error.message;
    } finally {
      if (version === loading) reload.disabled = false;
    }
  }
  fields.unit.onchange = () => load();
  fields.date.onchange = () => load();
  select.onchange = selectShift;
  reload.onclick = () => load(select.value);
  if (swap) {
    fields.kind.onchange = update;
    fields.subId.onchange = fillOccurrence;
  }

  async function saveOccurrence(canceling = false) {
    const row = selected();
    if (!row || saving) return;
    if (canceling && !fields.correction.reportValidity()) return;
    if (!canceling && !form.reportValidity()) return;
    const correction = correcting();
    const kind = swap ? fields.kind.value : 'exit';
    let action = kind;
    if (canceling) action = swap ? 'cancelSubstitution' : 'cancelExit';
    else if (correction && kind !== 'absence') action = swap ? 'correctSubstitution' : 'correctExit';
    const values = formData(form);
    const payload = { unit: values.unit, id: row.id, revision: row.revision };
    if (correction) payload.correction = values.correction;
    if (swap && correction) payload.subId = fields.subId.value;
    if (!canceling) {
      Object.assign(payload, { reason: values.reason, notes: values.notes });
      if (kind === 'substitute') Object.assign(payload, { name: values.name, start: values.start,
        end: values.end, originalAbsent: fields.originalAbsent.checked });
      if (kind === 'exit') payload.exit = values.exit;
    }
    const controls = [...form.querySelectorAll('input, select, textarea, button')].filter(item => !item.disabled);
    saving = true;
    controls.forEach(item => { item.disabled = true; });
    try {
      await saves[action](payload);
      notify(canceling ? 'Cancelamento confirmado no Google Sheets.' : 'Ocorrência confirmada no Google Sheets.');
      window.dispatchEvent(new Event('schedule-saved'));
    } catch (error) {
      notify(error.message, 'error');
      controls.forEach(item => { item.disabled = false; });
      saving = false;
      update();
      return;
    }
    controls.forEach(item => { item.disabled = false; });
    saving = false;
    await load(row.id);
  }
  form.onsubmit = event => { event.preventDefault(); saveOccurrence(); };
  cancel.onclick = () => saveOccurrence(true);
  load();
}

