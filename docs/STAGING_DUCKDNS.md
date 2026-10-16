# FADEGO — ambiente de testes `fadego.duckdns.org`

> **VPS atual:** Nginx + Node.js 22 + PostgreSQL + Certbot. Para esta VPS
> usar apenas a secção **Implementação para a VPS real** no fim.
> Os passos Docker/Compose anteriores destinam-se exclusivamente a
> um servidor dedicado separado e **não devem correr na VPS partilhada**.

Aprovado pelo owner como **endereço de testes** em 16/10/2026. A fonte
canónica continua a ser `martaxi-boss/fadego`; este diretório **não cria
outra aplicação** e **não publica nem modifica nada por si só**.

## Situação atual

O código dos PRs #12–#14 foi consolidado no PR #15, com validação
conjunta e capturas de ecrã de dados fictícios. O domínio
`https://fadego.duckdns.org` **não foi confirmado como acessível** e a
infraestrutura de VPS/DNS não pode ser dada como existente sem prova.
O `AGENTS.md` exige autorização do Supervisor antes de merge/deploy.

## Topologia pretendida (somente testes)

- Next.js e NextAuth, a mesma aplicação FADEGO do GitHub.
- PostgreSQL **exclusivo** `fadego_staging`, volume exclusivo, **sem porta
  pública** e sem ligação aos dados reais.
- App em `127.0.0.1:3100` no anfitrião, nunca numa porta pública.
- HTTPS com Caddy **apenas para um servidor dedicado** (profile
  `dedicated-host`), com **Basic Auth** antes de chegar ao Next.js.
- Se a VPS já tiver nginx/Caddy/Traefik a gerir 80/443, **não iniciar o
  gateway** deste Compose. Configurar um virtual host protegido no proxy
  existente, com encaminhamento para `127.0.0.1:3100`.
- `X-Robots-Tag: noindex, nofollow`; a app continua a ter `robots: noindex`.
- `NEXTAUTH_URL=https://fadego.duckdns.org`.
- `FADEGO_TRUST_PROXY_HOPS=0` até existir prova da topologia do proxy e
  sanitização do cabeçalho `X-Forwarded-For` (limites IP partilhados).

## Gates obrigatórios antes de disponibilizar o endereço

1. Confirmar que o domínio DuckDNS está sob controlo autorizado do owner,
   resolve para a VPS pretendida e que o servidor não aloja outro serviço
   conflitante nesse hostname.
2. Confirmar a VPS/runner operacional e aprovar **somente** o deploy de teste
   pelo Supervisor. Nenhum deploy é disparado por esta revisão.
3. Criar e guardar credenciais **distintas para testes** no cofre já aprovado
   da VPS: password hex PostgreSQL, NEXTAUTH_SECRET aleatório e password
   do portão de testes; o Caddy usa apenas o **hash bcrypt** da password.
   Nunca enviar tokens DuckDNS ou credenciais em issues, chats ou git.
4. Reservar o hostname à aplicação de testes, configurar HTTPS válido,
   garantir acesso autenticado e ausência de dados reais.
5. Só então iniciar e verificar o serviço. Nunca substituir a base existente
   ou reconfigurar o proxy de outros projetos às cegas.

## Alternativa Docker: apenas para servidor dedicado (NÃO a VPS atual)

As linhas seguintes são documentação para a orquestração já autorizada,
**não comandos executados**.

Num servidor dedicado separado, o runner opera a partir da raiz do repositório:
```sh
# Recebe as variáveis de um secret manager; não gravar segredos em git.
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml config --quiet
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml build app migrate
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml up -d db
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml run --rm migrate
docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml up -d app
```

O gateway Caddy só pode ser ativado com `--profile dedicated-host`
**depois** de confirmar que a VPS dedicada tem portas 80/443 livres e DNS
correcto. Numa VPS partilhada, usar o proxy já instalado com Basic Auth
equivalente e cabeçalhos de privacidade.

Num banco staging vazio, o primeiro SUPER_ADMIN pode ser criado **uma única
vez** pelo comando `pnpm bootstrap:admin` com credenciais do cofre; o
bootstrap recusa atuar quando existem utilizadores. Não reutilizar a
password de administração da produção. Dados de testes apenas sintéticos.

## Verificação de aceitação

Depois de HTTPS/Basic Auth estarem operacionais, a automação autorizada
executa `node scripts/smoke-staging.mjs` com `STAGING_GATE_USER` e
`STAGING_GATE_PASSWORD` lidos exclusivamente do cofre. Sem credenciais,
o teste distingue um HTTP 401 do portão de testes de uma falha de rede.

A verificação deve demonstrar: certificado TLS válido, resposta HTTP
controlada, branding FADEGO, `noindex`, rota de login protegida,
isolamento de tenants e nenhuma cobrança real.

**Não confundir** a pré-visualização já validada no GitHub com uma
implantação real em `fadego.duckdns.org`.


## Implementação para a VPS real: Nginx + Node.js 22 + PostgreSQL

**Inventário comprovado em 16/10/2026**, via SSH autenticado e com fingerprint
Ed25519 validada na [PR operacional #238](https://github.com/martaxi-boss/VPS/pull/238):

| Componente | Estado |
| --- | --- |
| Node.js | v22 disponível |
| Corepack | disponível; pnpm ainda não ativado |
| Nginx | ativo, portas 80 e 443 já ocupadas |
| PostgreSQL | serviço ativo, utilitários psql/pg_dump presentes |
| Certbot | instalado |
| Docker | não instalado |
| Serviço FADEGO 127.0.0.1:3100 | não está ativo |
| Certificado FADEGO | não visível |
| HTTPS fadego.duckdns.org | não responde com TLS validado |

**Por isso, NÃO instalar o gateway Caddy nem executar o Compose Docker desta
pasta na VPS partilhada.** Os ficheiros de Docker permanecem apenas como opção
isolada para outro servidor, sem interferência nos outros projetos.

Para a VPS existente, utilizar **exclusivamente** os ficheiros versionados em
\`deploy/staging/native/\`: serviço systemd sob utilizador dedicado, Nginx
como proxy já existente e PostgreSQL em base de dados independente.

### Ordem de ativação após autorização do Supervisor

Não há aprovação de integração/deploy registada em \`AGENTS.md\`, pelo que
**estes passos não foram executados**.

1. Certificar que o hostname pertence ao Owner e que não há um virtual host
   Nginx preexistente para \`fadego.duckdns.org\`. Não substituir nem editar
   configuração existente sem inspecionar o conflito e obter autorização.
2. No cofre atual da VPS, criar credenciais únicas para \`fadego_staging\`,
   \`NEXTAUTH_SECRET\` e Basic Auth; nunca as registar em ficheiros públicos.
3. Provisionar **novo** utilizador de sistema sem shell de login, diretório
   \`/srv/fadego-staging\` e base Postgres \`fadego_staging\` com role próprio.
   A base não é partilhada com nenhum outro serviço.
4. Obter **somente** a revisão aprovada do PR #15 e conferir o SHA antes do
   build. Com o Node.js 22 já presente, usar \`corepack pnpm install
   --frozen-lockfile\` e \`corepack pnpm build\` na pasta desse release,
   mantendo a cache e o serviço sob o utilizador de staging. Não alterar o
   Node.js global nem instalar Docker.
5. Aplicar \`corepack pnpm prisma migrate deploy\` na base exclusivamente
   staging, verificar o estado das migrações e nunca executar migrações nas
   bases de outros projetos.
6. Criar o ficheiro protegido \`/etc/fadego-staging/app.env\` a partir de
   \`deploy/staging/native/runtime.env.example\`, com permissões 0600 e
   credenciais do cofre. Ativar o serviço systemd definido em
   \`fadego-staging.service\`. Confirmar 200 em \`127.0.0.1:3100\`.
7. Preparar ACME em \`/var/www/letsencrypt\`, utilizar a configuração
   \`nginx-acme.conf\` para desafio HTTP-01 e obter certificado via Certbot
   **webroot**, sem invocar \`certbot --nginx\` nem permitir reescrita
   automática de vhosts alheios.
8. Com o certificado emitido e o Basic Auth protegido no cofre, acrescentar
   \`nginx-https.conf\` ao Nginx, **verificar conflitos de server_name**,
   executar \`nginx -t\` e apenas fazer \`systemctl reload nginx\`.
   Nunca reiniciar globalmente Nginx, Postgres ou outros serviços.
9. Validar de fora por HTTPS: utilizador não autenticado recebe 401, conta
   de demonstração entra com autenticação dupla, noindex está ativo, dados
   são apenas fictícios, rotas de barbearias isoladas e sem pagamentos
   reais. Executar \`node scripts/smoke-staging.mjs\` com credenciais do cofre.
10. Registar rollback da revisão da aplicação e do único virtual host
    FADEGO. Se surgir conflito, falhar sem tocar nos restantes projetos.

### Regras de segurança

- O Nginx nativo **não** pode abrir outra porta 80/443 nem substituir
  configurações de outros sites.
- A aplicação responde apenas em \`127.0.0.1:3100\`, não em \`0.0.0.0\`.
- O \`FADEGO_TRUST_PROXY_HOPS=0\` mantém-se até validar explicitamente a
  topologia e sanitização de cabeçalhos. Os limites por origem partilhada
  não podem ser considerados controlo antiautomação suficiente em produção.
- Sem email/SMS automático, pagamentos reais, utilizadores reais ou
  indexação pública neste ambiente.
- O \`AGENTS.md\` continua a proibir deploy/release sem autoridade do
  Supervisor. A escolha do hostname e a confirmação do IP pelo Owner não
  substituem essa aprovação.

### Build exato do release, isolado e sem sudo

O ficheiro `deploy/staging/native/build-release.sh` compila a revisão
indicada pelo Supervisor (SHA completo), sem mudar serviços de terceiros.
Só pode correr como utilizador do sistema `fadego-staging`, com
`DATABASE_URL` exclusivo da base `fadego_staging`, e exige o marcador
`FADEGO_STAGING_SUPERVISOR_APPROVED=1` após a aprovação formal
no processo existente. Este marcador não substitui a autorização verdadeira.

O script obtém o commit exato, instala as dependências com Corepack/pnpm,
executa build, aplica migrações apenas na base de staging e troca
atomicamente o symlink `current`. Não instala pacotes globais, não abre
portas, não reinicia aplicações e não altera Nginx. Um operador
autorizado só ativa a unidade systemd e os ficheiros Nginx depois
de todas as verificações e TLS estarem aprovados.
