# Entrega técnica para incorporação com Claude

## Recursos da instalação

| Recurso | Endereço ou identificação |
|---|---|
| Repositório | https://github.com/SupremeDev021/controle-ti-riosaude |
| Sistema publicado | https://supremedev021.github.io/controle-ti-riosaude/ |
| Produção | https://docs.google.com/spreadsheets/d/1Nkxk7jcGPQaiN_SPcQoNi4VbRfScy2tRK7kMmI0bU48/edit |
| Homologação | https://docs.google.com/spreadsheets/d/1DNTAdokYm1bh_vbzmdml0Rk-og3pBdac3UklcXM6_ts/edit |
| Projeto Apps Script | https://script.google.com/home/projects/1VB3w3mBK65D7gTg0lc8NW5mtOhscxTNek50vp93W-YsT6_tkfyF9REnZ/edit |
| API pública | https://script.google.com/macros/s/AKfycbz2qJrbemvWCFuHfFsms-1ny7hMjDeWTGR97m48LK7zsg--27e80xPJq12oYFtAqLHX/exec |

Os mesmos dados estão organizados em `config/integracao-atual.json`, com os IDs completos e as propriedades atuais do script.

## Estado verificado

O health da API confirmou em 19/11/2026 versão 3, planilha de produção, 14 unidades e fuso America/Sao_Paulo. A base contém uma aba por unidade, incluindo MATERNIDADE ROCINHA, e HISTORICO. O frontend possui montagem mensal por calendário, chegada individual, saídas, substituições, falta de cobertura, histórico, detalhes por unidade e modo TV.

Os registros que estavam na antiga base de homologação foram consolidados na produção, com IDs e histórico preservados. A origem não foi apagada. Não repita essa migração para simplesmente incorporar o frontend.

Verificações já realizadas na entrega: 32 testes automatizados, 13 verificações reais de persistência na homologação, retorno da configuração para produção e 14 cartões sem cortes em 1920×1080 e 1280×720. Essas verificações cobrem o módulo existente. A integração à plataforma principal ainda requer sua própria homologação.

## Configurações atuais do servidor

```text
SPREADSHEET_ID=1Nkxk7jcGPQaiN_SPcQoNi4VbRfScy2tRK7kMmI0bU48
FRONTEND_ORIGIN=http://localhost:8000,https://supremedev021.github.io
```

No domínio da plataforma principal, acrescente a origem exata a FRONTEND_ORIGIN. Informe protocolo, host e porta quando houver, sem caminho ou barra final. Não invente o domínio. O arquivo de configuração no repositório é uma referência e não efetua essa mudança no Google.

O frontend atual aponta para a API em `js/config.js`. Os modelos em `js/config.example.js` e `apps-script/properties.example.json` servem para uma instalação independente. A permissão para editar o Apps Script e as planilhas é verificada separadamente. IDs e URLs não substituem acesso autorizado à conta Google.

## Roteiro para Claude

1. Leia CLAUDE.md e examine o repositório da plataforma principal: framework, roteamento, estilos, backend, CSP e ciclo de vida dos módulos.
2. Defina a incorporação com base nessa arquitetura. Uma página própria preserva o contexto atual; iframe e componentes nativos exigem as adaptações descritas em INTEGRACAO.md.
3. Preserve o contrato da API e a estrutura atual do Sheets. Não altere ou limpe os registros existentes para instalar o módulo.
4. Configure a origem do destino e faça testes com uma base de homologação. Se reutilizar a homologação existente, preserve seus registros e identifique claramente os novos testes.
5. Valide consulta, lote mensal, recarga, chegadas individuais, saída, atraso de substituto, múltiplas trocas, madrugada, conflitos, histórico e TV. Execute também os testes de regressão da plataforma principal.
6. Se alterar o backend, publique nova versão e confira health e transporte completo. Se somente o frontend mudar de hospedagem, verifique as origens e o transporte antes de concluir que precisa de outro projeto Apps Script.
7. Entregue os arquivos alterados, a configuração efetiva, os resultados de testes e as limitações encontradas. Não declare compatibilidade apenas pela semelhança das tecnologias.

## Arquivos de servidor e testes

Instalação padrão: `Code.gs`, `Coverage.gs` e `appsscript.json`. A produção atual foi instalada como script consolidado. Ao atualizar esse projeto, não acrescente arquivos com funções e constantes duplicadas. Use os arquivos do repositório como fonte e escolha uma única organização no editor.

`Migration.gs` é uma ferramenta histórica de consolidação, não uma exigência de instalação. `tests/Integration.gs` é um teste manual específico da homologação e mantém auditoria dos registros de teste, desativando-os logicamente após o sucesso. Não utilize essa rotina para popular a produção.

O endpoint é público e permite gravação sem autenticação. O compartilhamento dos identificadores foi autorizado para a integração, sem incluir senhas, tokens privados ou exportação dos registros da planilha.
