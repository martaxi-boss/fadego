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

- Unidade `fadego-staging.service`: ainda utiliza o caminho antigo `/srv/fadego-staging/current`; precisa de ser atualizada e testada antes de retirar o link.
- Configuracao do Nginx, nome de dominio e eventuais ficheiros em `/var/www/fadego-preview`: confirmar a propriedade de cada caminho antes de os migrar.
- Bases de dados e ficheiros de configuracao privados **nao sao publicados no GitHub**.
- Node.js do sistema e Nginx sao infraestruturas Ubuntu neste estado; dependencias exclusivas FADEGO devem estar confinadas em `/srv/projects/fadego`.
- O repositorio e o processo instalados nao foram atualizados automaticamente para o ultimo `main`.

## Higienizacao e desinstalacao

Nao remover releases antigas antes de confirmar quais sao usadas por `current`, de confirmar a politica de recuperacao e de testar o arranque atual. Para uma desinstalacao independente, exportar/guardar dados conforme decisao do proprietario, parar apenas `fadego-staging.service`, remover unidades, proxy e referencias exclusivas deste projeto e depois a sua pasta, sem perturbar os outros projetos.

**Ainda nao certificado para desinstalar simplesmente apagando o diretorio.** O nome fisico ja corresponde ao nome do repositorio.
