# Integração do Controle Operacional de TI — RioSaúde

Este repositório entrega um módulo funcional para incorporar à plataforma principal. O usuário autorizou incluir os IDs das planilhas e as configurações da instalação para permitir essa integração.

## Comece por estes arquivos

1. `config/integracao-atual.json`: IDs reais da produção e homologação, URL da API, projeto Apps Script e propriedades atuais.
2. `docs/ENTREGA-CLAUDE.md`: estado da instalação, roteiro de incorporação e pontos já verificados.
3. `docs/INTEGRACAO.md`: contrato da API e impactos de rotas, CSS, transporte e TV.
4. `docs/INSTALACAO.md`: estrutura dos dados, configuração e homologação.

## Escopo

Examine a arquitetura da plataforma principal antes de definir como incorporar este módulo. Preserve o comportamento das funcionalidades existentes e as regras de escala e cobertura. Não presuma que o frontend possa ser inserido diretamente como componente ou iframe sem adaptação.

Não é necessário recriar a base ou migrar dados para aproveitar a API existente. A API usa a planilha de produção identificada no arquivo de configuração. A homologação tem outro ID e não deve substituir o destino de produção durante o uso normal.

O módulo foi solicitado sem autenticação. Não adicione telas de login ou gestão de usuários como parte desta incorporação. Uma eventual mudança de modelo de acesso exige uma decisão separada do responsável.

## Pontos técnicos

- Frontend HTML/CSS/JS puro com módulos ES, rotas por hash e estilos globais. Integração nativa exige isolar seletores, IDs, eventos e timers.
- `js/api.js` usa POST por formulário em iframe oculto, com canal aleatório e confirmação por postMessage.
- `apps-script/Code.gs` responde com `window.top.postMessage`. Um iframe externo da plataforma muda o destinatário do retorno e exige adaptação coordenada e teste real.
- `FRONTEND_ORIGIN` fica nas propriedades do Apps Script. Inclua a origem exata do domínio de destino após verificá-la. O JSON de referência não altera essas propriedades automaticamente.
- Preserve UUIDs de operação, revisões, LockService, gravação atômica da escala e auditoria, exclusão lógica e tratamento de erros.
- Cobertura usa America/Sao_Paulo, datas completas, chegada individual confirmada e intervalo vigente. Escala e substituição planejadas não confirmam chegada.
- Preserve as 14 unidades, todas as substituições de cada plantão, o histórico e as indicações de cobertura informada.

## Verificação

Execute `node --test tests/coverage.test.mjs` com Node.js 24. Existem 32 testes automatizados. Use homologação para testar novas gravações e valide as funcionalidades anteriores da plataforma principal.

`tests/Integration.gs` contém o teste manual real da instalação de homologação. Ele troca temporariamente a propriedade SPREADSHEET_ID sob lock e a restaura em finally. Antes de executar, examine o procedimento e confirme que não existe outra cópia do mesmo código no projeto. A execução interrompe temporariamente o acesso pela API enquanto detém o lock.

`apps-script/Migration.gs` registra uma migração já concluída. Não execute essa rotina como etapa padrão da incorporação. Se o destino de dados for mudar, planeje separadamente preservação, backup e validação dos registros.

Salvar o código no editor Apps Script não atualiza uma implantação versionada. Se alterar o backend, publique uma nova versão na implantação existente e valide o health. Permissões e autorização Google devem ser verificadas pelo responsável, sem incluir credenciais no repositório.
