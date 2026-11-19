import { API_URL } from './config.js';

export const configured = Boolean(API_URL);
let endpoint;
try {
  const url = new URL(API_URL);
  if (url.origin === 'https://script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) endpoint = url.href;
} catch {
  // The deployment URL is configured during installation.
}

export function api(action, fields = {}) {
  if (!endpoint) return Promise.reject(new Error('Configure a URL /exec do Google Apps Script em js/config.js.'));
  return new Promise((resolve, reject) => {
    const channel = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.name = 'rpc-' + channel;
    frame.hidden = true;
    frame.title = 'Conexão com Google Sheets';
    const form = document.createElement('form');
    form.hidden = true;
    form.method = 'POST';
    form.action = endpoint;
    form.target = frame.name;
    const values = { transport: 'frame', channel, origin: location.origin, payload: JSON.stringify({ action, ...fields }) };
    for (const [name, value] of Object.entries(values)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
      frame.remove();
      form.remove();
    }
    function receive(event) {
      if (!/^https:\/\/(?:[a-z0-9-]+-script\.)?googleusercontent\.com$|^https:\/\/script\.googleusercontent\.com$/.test(event.origin)
        || event.data?.channel !== channel) return;
      cleanup();
      const result = event.data.result;
      if (result?.ok) resolve(result.data);
      else {
        console.error('Falha na API', { action, code: result?.code, message: result?.error });
        reject(Object.assign(new Error(result?.error || 'Resposta inválida do Google Sheets.'), { code: result?.code }));
      }
    }
    const timeout = setTimeout(() => {
      cleanup();
      console.error('Tempo de resposta da API excedido', { action });
      reject(Object.assign(new Error('O Google Sheets não confirmou a operação. Verifique a conexão e tente novamente.'), { code: 'TIMEOUT' }));
    }, 40000);
    window.addEventListener('message', receive);
    document.body.append(frame, form);
    form.submit();
  });
}

export function retryableMutation(action) {
  let lastPayload;
  let requestId;
  return async (fields) => {
    const payload = JSON.stringify(fields);
    if (payload !== lastPayload) requestId = crypto.randomUUID();
    lastPayload = payload;
    const result = await api(action, { ...fields, requestId });
    lastPayload = undefined;
    return result;
  };
}
