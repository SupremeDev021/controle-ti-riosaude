# Controle Operacional de TI — RioSaúde

Frontend em HTML, CSS e JavaScript para escala mensal e cobertura informada de TI das 14 unidades. Backend publicado no Google Apps Script com armazenamento no Google Sheets.

Funcionalidades: dashboard, montagem mensal por seleção de datas, chegada individual de técnicos e substitutos, saídas, trocas, falta de cobertura, calendário, histórico e modo TV.

## Hospedagem

Ative GitHub Pages na branch main, pasta raiz. Configure a origem do site nas propriedades do Apps Script em FRONTEND_ORIGIN. A URL pública da API fica em js/config.js. O transporte usa formulário e iframe com confirmação por postMessage para lidar com os redirecionamentos do Google.

## Operação

A escala planejada não confirma presença. Registre cada chegada para habilitar cobertura durante o intervalo vigente. Saída antecipada encerra a cobertura do titular. Substitutos exigem confirmação própria. A consulta do dashboard é atualizada a cada 60 segundos e após gravações.

## Acesso público

O sistema não exige login. O endpoint público permite leitura e gravação por quem descobrir sua URL. Validação, limites de requisição e controle de concorrência não identificam supervisores. Não registrar dados sensíveis.
