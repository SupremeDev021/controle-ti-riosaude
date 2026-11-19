# Instalação do módulo RioSaúde

Este guia descreve uma instalação. Para incorporar a instalação existente, consulte `config/integracao-atual.json` e `docs/ENTREGA-CLAUDE.md`, que contêm os IDs reais e o estado atual. A implantação do Apps Script e as permissões da planilha devem ser verificadas separadamente pela equipe responsável.

## Estrutura entregue

- `index.html`, `css/`, `js/`: frontend estático em JavaScript puro, sem build ou dependências de terceiros.
- `apps-script/Code.gs`: API, validação, persistência, revisão, idempotência e auditoria.
- `apps-script/Coverage.gs`: regras de datas, plantões, ocorrências e cobertura calculada.
- `apps-script/appsscript.json`: manifesto V8, fuso e serviço avançado Sheets v4.
- `apps-script/properties.example.json`: modelo de propriedades, sem configuração automática.
- `js/config.example.js`: modelo da URL da API para outra instalação.
- `tests/coverage.test.mjs`: testes locais com simulação dos serviços Google.
- `docs/INTEGRACAO.md`: dependências, contrato e avaliação preliminar de compatibilidade.

O `js/config.js` usado pelo site existente mantém seu endpoint público. Para uma instalação independente, copie `config.example.js` para `config.js` e configure seu próprio Web App. O endpoint não é uma credencial privada, mas oferece operações públicas sem autenticação.

## Google Sheets e Apps Script

1. Crie uma planilha vazia no Google Sheets. Copie o ID da URL, entre `/d/` e `/edit`.
2. Crie um projeto Apps Script. Adicione os conteúdos de `Code.gs` e `Coverage.gs` em arquivos separados. Não duplique esses arquivos em um script consolidado já existente.
3. Habilite a exibição do manifesto nas configurações e instale o conteúdo de `appsscript.json`. Confirme o serviço avançado Google Sheets API v4. Se utilizar um projeto Google Cloud próprio, verifique também se a API está habilitada nele.
4. Em Propriedades do script, configure `SPREADSHEET_ID` e `FRONTEND_ORIGIN` conforme o exemplo. A origem contém protocolo, host e porta, sem caminho ou barra final. Múltiplas origens podem ser separadas por vírgula.
5. Execute `setupSheets` com a conta responsável e conclua a autorização do Google. A rotina cria as 14 abas de unidades e `HISTORICO`, configura o fuso e os cabeçalhos. É idempotente e preserva registros existentes. Cabeçalhos preenchidos incompatíveis interrompem a execução para revisão.
6. Publique como App da Web executando como proprietário, com acesso anônimo conforme a política da instituição. Configure a URL `/exec` em `js/config.js`.
7. Em futuras alterações do servidor, atualize a implantação para uma nova versão. Salvar arquivos no editor não atualiza automaticamente a versão publicada.

Não execute `Migration.gs` como parte de uma instalação ou incorporação normal: a consolidação anterior já foi realizada. Para uma nova migração de dados, faça um inventário e uma cópia de segurança antes de definir o procedimento.

## Estrutura dos dados

As unidades são definidas no catálogo `UNITS` em `Code.gs`, incluindo MATERNIDADE ROCINHA. Cada unidade tem uma aba com:

`ID`, `Data`, `Técnico`, `Início`, `Término`, `Situação`, `Substituto`, `Início substituição`, `Término substituição`, `Saída real`, `Motivo`, `Observações`, `Atualização`, `Metadados`.

`Metadados` armazena revisão, exclusão lógica, confirmação de chegada com data/hora completa, todas as substituições e seus identificadores, ausência e tipo de registro. As colunas visíveis de substituição resumem somente a última troca. Preserve os metadados para manter múltiplas substituições e chegadas individuais.

`HISTORICO` usa: `Data/hora`, `Unidade`, `Operação`, `ID do registro`, `Dados anteriores`, `Dados posteriores`, `Requisição`, `Digest`.

O campo Situação não substitui o cálculo de cobertura. Não escreva diretamente nas células pelos formulários da plataforma principal: use a API para manter validação, revisão, lock, idempotência e auditoria atômica.

## Frontend

Para teste local, execute `python -m http.server 8000` na raiz e abra `http://localhost:8000/`. Configure essa origem no Apps Script. Não abra `index.html` diretamente como arquivo. Em GitHub Pages, use a branch principal e a pasta raiz. Em outro servidor, publique `index.html`, `css/` e `js/`, preservando caminhos relativos e o tipo MIME dos módulos JavaScript.

O sistema abre no Dashboard, sem login. O acesso às planilhas ocorre no servidor. Não coloque credenciais, tokens privados ou permissões de proprietário no frontend.

## Validação

Execute `node --test tests/coverage.test.mjs` com Node.js 24. A suíte contém 32 testes e não acessa planilhas reais. Testa cobertura noturna, técnicos simultâneos, saída parcial, substituições, confirmação individual, revisão concorrente, lock ocupado, idempotência, falha de gravação simulada, auditoria, catálogo e montagem mensal.

Antes de liberar a integração, use uma planilha de homologação independente para validar:

1. `health` retorna a versão, o ID do destino, 14 unidades e o fuso correto.
2. Um lote mensal permanece após recarregar o navegador e aparece na aba correta.
3. Cada chegada é confirmada individualmente, inclusive a do substituto.
4. Saída antecipada e troca com atraso preservam os intervalos trabalhados e descobertos.
5. Duas sessões editando a mesma revisão recebem conflito e não sobrescrevem dados silenciosamente.
6. Correções e exclusões lógicas preservam o histórico.
7. Dashboard e modo TV mostram as 14 unidades e atualizam após uma gravação confirmada.
8. As funcionalidades anteriores da plataforma principal continuam operacionais.

## Limites operacionais

O endpoint sem autenticação é público: qualquer pessoa que descubra sua URL pode consultar e alterar escalas. A lista de origens do iframe não autentica supervisores. A API implementa limite global por minuto, não limite por pessoa, pois não há identidade de usuário. Não registrar dados sensíveis.

As consultas e gravações são serializadas pelo LockService. Escala e auditoria são gravadas no mesmo lote da API Sheets. O volume esperado, a quantidade de telas abertas, as cotas da conta Google e o tempo de resposta devem ser medidos na homologação da plataforma de destino.
