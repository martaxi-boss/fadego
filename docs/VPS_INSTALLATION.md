# FADEGO — instalacao Ubuntu VPS

**Repositorio:** `martaxi-boss/fadego`. **Estado observado em 03-11-2026:** servico `fadego-staging.service` ativo.

## Pasta fisica do projeto

A aplicacao, as releases e as dependencias locais foram movidas de `/srv/fadego-staging` para **`/srv/projects/fadego`** (3 840 331 776 bytes no momento da mudanca).

Estrutura atual:
- `releases/<identificador>/` — versoes instaladas e respetivos `node_modules`;
- `current` — link **relativo** `releases/2b3554ec6e075e36041e44178f99535e00961b2f`, dentro da pasta do projeto;
- `.local/`, `.cache/`, `.config/`, `.pnpm-store/` — ficheiros e caches da instalacao.

O caminho antigo **`/srv/fadego-staging` continua apenas como link de compatibilidade** para as unidades e referencias historicas. Os ficheiros nao foram copiados nem eliminados. O processo Next.js continuou ativo com PID `1144`, sem reinicio, e os restantes servicos foram mantidos.

[Prova real: GitHub Actions #41713861548](https://github.com/martaxi-boss/VPS/actions/runs/41713861548).

## Integracao do Ubuntu e independencia

- Unidade `fadego-staging.service`: configurada para `/srv/projects/fadego/current`, validada com `systemd-analyze verify` e `daemon-reload`. O servico manteve PID 1144 sem reinicio. Falta certificacao de um arranque controlado antes de retirar a ligacao antiga.
- Configuracao do Nginx: a pasta publica foi movida fisicamente para `/srv/projects/fadego/www/preview`; `/var/www/fadego-preview` e apenas um alias de compatibilidade, ainda pendente de eliminacao apos testes.
- Bases de dados e ficheiros de configuracao privados **nao sao publicados no GitHub**.
- Node.js do sistema e Nginx sao infraestruturas Ubuntu neste estado; dependencias exclusivas FADEGO devem estar confinadas em `/srv/projects/fadego`.
- O repositorio e o processo instalados nao foram atualizados automaticamente para o ultimo `main`.

## Higienizacao e desinstalacao

Nao remover releases antigas antes de confirmar quais sao usadas por `current`, de confirmar a politica de recuperacao e de testar o arranque atual. Para uma desinstalacao independente, exportar/guardar dados conforme decisao do proprietario, parar apenas `fadego-staging.service`, remover unidades, proxy e referencias exclusivas deste projeto e depois a sua pasta, sem perturbar os outros projetos.

**Ainda nao certificado para desinstalar simplesmente apagando o diretorio.** O nome fisico ja corresponde ao nome do repositorio.

## Servico systemd no caminho canonico

A configuracao existente da unidade `fadego-staging.service` passou a apontar para `/srv/projects/fadego/current`, sem ficheiros adicionais de override. `systemd-analyze verify` e `systemctl daemon-reload` passaram; PID 1144 manteve-se. [Prova #41716531862](https://github.com/martaxi-boss/VPS/actions/runs/41716531862).

## Consolidacao fisica da pasta publica — 04-11-2026

A auditoria [#41752114680](https://github.com/martaxi-boss/VPS/actions/runs/41752114680) confirmou que o Nginx precisava apenas de traversal para `www-data` na raiz privada `0750` do FADEGO. Foi aplicada uma ACL restrita (`www-data`: apenas atravessar a pasta), sem tornar a raiz publicamente listavel.

A execucao [#41752269362](https://github.com/martaxi-boss/VPS/actions/runs/41752269362) moveu fisicamente a pasta publica `/var/www/fadego-preview` para `/srv/projects/fadego/www/preview` e deixou o caminho antigo como symlink temporario. Confirmou inode, propriedade e permissoes preservados, leitura do `index.html` pelo `www-data`, `nginx -t` positivo e estados dos restantes servicos iguais.

**Ainda por certificar:** atualizar referencias externas do proxy Nginx e automatismos para a pasta canonica; testar HTTP/HTTPS e reinicio controlado; retirar alias; inventariar todas as bases de dados e configuracoes privadas; implementar desinstalacao isolada. Nao remover releases antes de confirmar a versao ativa e um fallback restauravel.
