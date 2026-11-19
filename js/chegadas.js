import { api, retryableMutation } from './api.js';
import { displayDate, empty, escape, formData, heading, minuteDate, minuteTime, options, today, units, zone } from './utils.js';

export function currentLocalDateTime() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(' ', 'T');
}

export function renderArrival(root, params, notify) {
  const unit = units.includes(params.get('unit')) ? params.get('unit') : units[0];
  root.innerHTML = heading('Confirmar chegada', 'Informe a chegada de cada técnico ou substituto para atualizar a cobertura.')
    + '<form class="surface occurrence-form"><div class="fields"><label>Unidade<select name="unit">' + options(units, unit) + '</select></label>'
    + '<label>Data de referência<input name="date" type="date" required value="' + escape(params.get('date') || today()) + '"></label>'
    + '<label class="wide">Técnico e plantão<select name="person" required disabled><option value="">Consultando…</option></select></label>'
    + '<label class="wide">Horário previsto<input name="planned" readonly></label>'
    + '<label class="wide">Data e hora reais de chegada<input name="arrival" type="datetime-local" required></label>'
    + '<label class="wide" data-correction hidden>Justificativa da correção<input name="correction" maxlength="400" disabled></label>'
    + '</div><p class="form-message" aria-live="polite"></p><div class="form-footer">'
    + '<button type="button" class="button secondary" data-reload>Recarregar</button>'
    + '<button type="button" class="button secondary" data-cancel hidden>Cancelar confirmação</button>'
    + '<button class="button primary" type="submit" disabled>Confirmar chegada</button></div></form>';
  const form = root.querySelector('form');
  const fields = form.elements;
  const submit = form.querySelector('[type=submit]');
  const cancel = form.querySelector('[data-cancel]');
  const reload = form.querySelector('[data-reload]');
  const message = form.querySelector('.form-message');
  const saves = Object.fromEntries(['confirmArrival','correctArrival','cancelArrival'].map(action => [action, retryableMutation(action)]));
  let candidates = [];
  let version = 0;
  let busy = false;
  const selected = () => candidates.find(person => person.id + ':' + person.subId === fields.person.value);
  function update() {
    const person = selected();
    const correction = Boolean(person?.arrival);
    fields.planned.value = person ? displayDate(minuteDate(person.from)) + ' ' + minuteTime(person.from) + ' até '
      + displayDate(minuteDate(person.to)) + ' ' + minuteTime(person.to) : '';
    fields.arrival.value = person?.arrival || currentLocalDateTime();
    fields.correction.value = '';
    fields.correction.disabled = !correction;
    fields.correction.required = correction;
    form.querySelector('[data-correction]').hidden = !correction;
    cancel.hidden = !correction;
    submit.textContent = correction ? 'Salvar correção da chegada' : 'Confirmar chegada';
    submit.disabled = !person || busy;
  }
  async function load(keep = '') {
    const request = ++version;
    const { unit, date } = formData(form);
    fields.person.disabled = true;
    submit.disabled = true;
    reload.disabled = true;
    message.textContent = '';
    try {
      const rows = await api('arrivalCandidates', { unit, date });
      if (request !== version || !root.contains(form)) return;
      candidates = rows;
      fields.person.innerHTML = '<option value="">' + (rows.length ? 'Selecione o técnico' : 'Nenhum intervalo de técnico nesta data') + '</option>'
        + rows.map(person => '<option value="' + escape(person.id + ':' + person.subId) + '">'
          + escape(person.name + (person.substitute ? ' (substituto)' : '') + ' · ' + minuteTime(person.from) + ' – ' + minuteTime(person.to)
            + (person.arrival ? ' · chegada confirmada' : ' · aguardando chegada')) + '</option>').join('');
      fields.person.disabled = !rows.length;
      const preferred = keep || (params.get('id') ? params.get('id') + ':' + (params.get('subId') || '') : '');
      if (rows.some(person => person.id + ':' + person.subId === preferred)) fields.person.value = preferred;
      update();
    } catch (error) { message.textContent = error.message; fields.person.innerHTML = '<option value="">Consulta indisponível</option>'; }
    finally { reload.disabled = false; }
  }
  async function save(canceling) {
    if (busy || !selected()) return;
    if (canceling ? !fields.correction.reportValidity() : !form.reportValidity()) return;
    const person = selected();
    const payload = { unit: fields.unit.value, id: person.id, revision: person.revision, subId: person.subId || '' };
    const action = canceling ? 'cancelArrival' : person.arrival ? 'correctArrival' : 'confirmArrival';
    if (!canceling) payload.arrival = fields.arrival.value;
    if (person.arrival) payload.correction = fields.correction.value;
    const enabled = [...form.elements].filter(control => !control.disabled);
    busy = true;
    enabled.forEach(control => { control.disabled = true; });
    try {
      await saves[action](payload);
      notify(canceling ? 'Cancelamento da chegada confirmado no Google Sheets.' : 'Chegada confirmada no Google Sheets.');
      window.dispatchEvent(new Event('schedule-saved'));
    } catch (error) {
      notify(error.message, 'error');
      enabled.forEach(control => { control.disabled = false; });
      busy = false;
      return;
    }
    enabled.forEach(control => { control.disabled = false; });
    busy = false;
    await load(person.id + ':' + person.subId);
  }
  fields.unit.onchange = () => load();
  fields.date.onchange = () => load();
  fields.person.onchange = update;
  reload.onclick = () => load(fields.person.value);
  cancel.onclick = () => save(true);
  form.onsubmit = event => { event.preventDefault(); save(false); };
  load();
}
