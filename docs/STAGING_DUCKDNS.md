# FADEGO — ambiente de testes `fadego.duckdns.org`

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

## Execução em VPS aprovada

As linhas seguintes são documentação para a orquestração já autorizada,
**não comandos executados**.

O runner opera a partir da raiz do repositório:
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
