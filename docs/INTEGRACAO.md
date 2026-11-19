# Integração à plataforma principal

## Situação da avaliação

A arquitetura da plataforma principal ainda não foi fornecida. Esta é uma avaliação do código do módulo. A compatibilidade com a plataforma de destino permanece pendente e não deve ser considerada aprovada.

O módulo utiliza frontend estático com módulos ES, Google Apps Script e Sheets. Não depende de React, Vue, bibliotecas de UI, bundler, SQL ou serviço de autenticação.

## Opções e impactos identificados

| Forma de incorporar | Condições e impacto |
|---|---|
| Link na navegação para abrir o módulo como página própria | Preserva o contexto atual do frontend, a navegação por hash e o retorno da API. É o caminho inicial com menor alteração no código existente |
| Página própria em uma subpasta do servidor principal | Caminhos são relativos. Configurar a origem do domínio no Apps Script, MIME JavaScript, HTTPS e políticas de formulários e frames. Testar navegação e transporte nesse domínio |
| Iframe dentro da plataforma | Requer adaptação do retorno da API. O backend atual usa `window.top.postMessage`, que passa a apontar para a plataforma externa ao módulo. Não incorporar por iframe sem adaptar e testar esse canal, as origens, o sandbox e fullscreen |
| Componentes nativos no mesmo documento da plataforma | Requer trabalho de integração. CSS global, IDs, rotas por hash, eventos e timers precisam ser isolados e integrados ao ciclo de vida da plataforma |

Essa comparação é uma inferência baseada no código atual. A escolha final depende dos requisitos da plataforma e da homologação.

## Dependências que precisam ser verificadas

- **Navegação:** `app.js` usa `location.hash` e `hashchange`, incluindo `#dashboard`, `#escala`, `#chegada` e `#tv`. Um roteador por hash da plataforma pode disputar as mesmas rotas.
- **DOM e CSS:** o módulo usa IDs como `view`, `navigation`, `notice`, `main` e `sidebar`, além de seletores globais de elementos e classes. A simples inclusão no DOM da plataforma pode alterar os dois sistemas.
- **Ciclo de vida:** timers de relógio e atualização são iniciados no carregamento. Uma conversão para componente precisa oferecer montagem e desmontagem para não duplicar consultas e eventos.
- **API:** `js/api.js` valida URLs `/exec` no domínio `script.google.com`. Uma API em outro domínio não pode ser conectada apenas trocando a URL: será necessário adaptar o transporte.
- **CORS e redirecionamentos:** o cliente atual envia POST por formulário a um iframe oculto. A resposta HTML usa postMessage com origem de destino e canal aleatório. Não trocar por fetch JSON sem validar preflight, redirecionamentos e leitura da resposta.
- **Políticas do navegador:** verificar CSP para formulário, frames do Apps Script e conteúdo Google redirecionado. Verificar as origens efetivamente utilizadas na homologação. Não desabilitar CSP globalmente para acomodar o módulo.
- **Contexto seguro:** `crypto.randomUUID` e fullscreen devem ser testados sob HTTPS. Localhost é usado no desenvolvimento.
- **TV:** o modo TV altera classes no body, ocupa o viewport e usa fullscreen quando permitido. Em uma integração nativa, limitar esses efeitos ao módulo e testar a saída do modo TV.
- **Origem do site:** FRONTEND_ORIGIN exige a origem exata. A URL de uma subpasta tem a mesma origem do domínio principal, sem incluir o caminho.
- **Acesso:** login na plataforma principal não protege automaticamente um Web App do Apps Script que continua público. Alterar esse modelo é uma decisão separada, fora da integração atual sem autenticação.

## Contrato do backend

Consultas aceitam GET e POST. Mutações exigem POST. JSON direto deve seguir redirecionamentos. O frontend usa o transporte frame documentado em `INSTALACAO.md` e implementado em `js/api.js`.

Respostas: `{ "ok": true, "version": 3, "data": ... }` ou `{ "ok": false, "code": "...", "error": "..." }`.

| Ações | Dados principais |
|---|---|
| `units`, `health`, `dashboard` | Sem filtros. health identifica versão e destino. dashboard calcula todas as unidades no horário atual |
| `month`, `day` | `unit` e `month` AAAA-MM ou `date` AAAA-MM-DD |
| `unitDetail` | `unit`, `date`, `from`, `to`, período máximo de 366 dias |
| `technicians`, `arrivalCandidates` | `unit`; candidatos também exigem `date` |
| `history` | `unit`, `date`, `operation`, `page` opcionais; página de 30 registros |
| `saveMonth` | `unit`, `month`, `rows`, `remove`. Edições e remoções incluem ID e revisão |
| `editShift`, `deactivateShift` | `unit`, `month`, `shift` com ID e revisão |
| `exit`, `correctExit`, `cancelExit` | `unit`, `id`, `revision`; saída usa `exit`, `reason`, `notes`; correção/cancelamento exigem `correction` |
| `substitute`, `correctSubstitution`, `cancelSubstitution` | `unit`, `id`, `revision`; troca usa `name`, `start`, `end`, `originalAbsent`, `reason`, `notes`; correção/cancelamento identificam `subId` e exigem `correction` |
| `confirmArrival`, `correctArrival`, `cancelArrival` | `unit`, `id`, `revision`, `subId` para substituto; chegada em `arrival` AAAA-MM-DDTHH:mm; correções/cancelamentos exigem `correction` |
| `absence` | `unit`, `id`, `revision`, `reason`, `notes` |
| `coverageReports`, `reportCoverageGap`, `cancelCoverageGap` | Consulta por unidade/data; novo período com `date`, `start`, `end`, `reason`, `notes`; cancelamento com ID, revisão e justificativa |

Toda mutação inclui `requestId` UUID. O cliente reaproveita esse identificador ao repetir o mesmo payload após falha de comunicação. Não reutilizar o UUID para conteúdos diferentes. Conflitos de revisão exigem recarregar os dados. Não atualizar a interface como salva antes da resposta positiva.

Plantões têm `date`, `tech`, `start`, `end`; fim igual ou anterior ao início representa o dia seguinte. Múltiplos técnicos e substituições possuem intervalos independentes. A chegada é vinculada ao ID do plantão e, no caso de troca, ao ID do substituto.

## Regras que a integração deve preservar

- Fuso America/Sao_Paulo, datas completas internamente e intervalos com fim exclusivo.
- Escala planejada, ocorrência registrada e cobertura calculada são informações distintas.
- Só conta como cobertura o intervalo vigente de um técnico com chegada confirmada. Substitutos também exigem confirmação própria.
- Saída antecipada preserva o período trabalhado. Outro técnico confirmado pode manter a unidade coberta.
- Falta de cobertura informada manualmente prevalece no período registrado até término ou cancelamento auditado.
- Cores: verde ativa, amarelo aguardando chegada no intervalo atual, vermelho sem cobertura, azul substituição confirmada e cinza sem escala.
- IDs, revisões, exclusão lógica, todas as substituições e histórico anterior/posterior devem ser preservados.
- Atualização a cada 60 segundos e após confirmação de gravação. A informação é cobertura informada, sem comprovação de presença física.

## Informações necessárias da plataforma de destino

Repositório e branch de referência, framework e versões, roteador, backend, domínio de homologação, CSP, forma de distribuição dos módulos e requisitos para navegação e TV. Identificar também quem publicará o Apps Script, qual planilha de homologação será usada e qual o volume esperado de sessões simultâneas.

## Plano de validação

1. Escolher a forma de incorporação após examinar a plataforma.
2. Implantar em ambiente de homologação e planilha independente.
3. Validar o transporte navegador → API → Sheets → resposta, incluindo erros e conflitos.
4. Executar os cenários de `INSTALACAO.md` e os testes existentes da plataforma principal.
5. Conferir TV, mobile, navegação, CSP e atualização automática.
6. Revisar a configuração de produção e as permissões separadamente, antes de liberar o módulo.
