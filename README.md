# Controle Operacional de TI — RioSaúde

Módulo de escalas e cobertura informada de TI para 14 unidades de saúde. Frontend em HTML, CSS e JavaScript puro, backend no Google Apps Script e persistência no Google Sheets.

[Acessar o sistema](https://supremedev021.github.io/controle-ti-riosaude/) · [Instalação](docs/INSTALACAO.md) · [Integração à plataforma principal](docs/INTEGRACAO.md)

## Funcionalidades

Escalas mensais em lote, montagem por calendário, chegada individual de técnicos e substitutos, saídas antecipadas, substituições, períodos sem cobertura, histórico auditado, Dashboard e modo TV com 14 unidades.

## Conteúdo

O repositório contém o frontend, `apps-script/Code.gs`, `apps-script/Coverage.gs`, manifesto do Apps Script, configurações de exemplo e testes. Os exemplos não incluem IDs das planilhas atuais. A implantação Google e as permissões devem ser verificadas separadamente pela equipe responsável.

Para outra instalação, copie `js/config.example.js` para `js/config.js` e configure sua URL `/exec`. O config.js do site existente mantém o endpoint público já publicado.

## Testes

Com Node.js 24: `node --test tests/coverage.test.mjs`. Os testes simulam os serviços Google. O guia de instalação descreve a homologação em uma planilha independente.

## Integração

A compatibilidade final depende da arquitetura da plataforma principal. O módulo usa rotas por hash, CSS global e um canal de resposta da API baseado em window.top. A incorporação por iframe ou como componente precisa de adaptação e homologação. Consulte a análise técnica antes de incorporar os arquivos.

## Acesso público

O sistema não exige login. Quem descobrir a URL do endpoint pode consultar e alterar escalas. Validação, controle de concorrência e limitação global de requisições não autenticam supervisores. Não registrar dados sensíveis.
