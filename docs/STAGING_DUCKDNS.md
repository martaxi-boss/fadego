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
conjunta e capturas de ecrã de dados fictícios. O domínio DuckDNS foi
confirmado pelo Owner como pertencente à VPS `146.59.145.3`. O acesso
SSH à VPS foi comprovado, mas o HTTPS **ainda não responde** e o FADEGO
**ainda não foi instalado**. Não interpretar a conectividade SSH como
certificação da aplicação ou autorização de publicação. O `AGENTS.md`
exige aprovação do Supervisor antes de merge/deploy.

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
   do portão de testes; na VPS atual o Nginx usa o ficheiro 
   **htpasswd protegido**, e no perfil dedicado o Caddy usa um hash.
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
vez** pelo comando `corepack pnpm bootstrap:admin` com credenciais do cofre; o
bootstrap recusa atuar quando existem utilizadores. Não reutilizar a
password de administração da produção. Dados de testes apenas sintéticos.

## Verificação de aceitação

Depois de HTTPS/Basic Auth estarem operacionais, a automação autorizada
executa `node scripts/smoke-staging.mjs` com `STAGING_GATE_USER` e
`STAGING_GATE_PASSWORD` lidos exclusivamente do cofre. Sem credenciais,
o teste verifica apenas que existe HTTPS válido, desafio **HTTP Basic**
e cabeçalho `noindex`; **não certifica a aplicação**. Com credenciais,
o teste recusa porta/site inesperado, passwords incorretas, ausência
de proteção, indexação pública, perda de privacidade no Referer e acesso
não autenticado ao admin. O script é estritamente só de leitura.

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
- Envio de email **apenas após** aprovação do remetente, domínio verificado,
  chave do cofre e teste real de receção. Sem SMS automático, pagamentos reais,
  utilizadores reais ou indexação pública neste ambiente.
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


### Segurança na preparação e reversão de releases

- O script nativo verifica que `/srv/fadego-staging/releases` não é um
  symlink, que `current` não aponta para outro projeto e que não existe
  uma troca pendente. Um release incompleto da **sua própria** tentativa é
  apagado apenas em caso de falha. A revisão ativa anterior permanece.
- `prisma migrate deploy` pode alterar a estrutura da base de staging.
  **Reverter o symlink não reverte migrações PostgreSQL**: antes de um
  upgrade, fazer backup da base isolada e garantir compatibilidade das
  migrações ou uma reposição isolada aprovada. Nunca recorrer a um
  `migrate reset` ou `db push --force-reset` em dados reais.
- A troca do symlink `current` não reinicia o serviço. Só o operador
  autorizado reinicia **apenas** `fadego-staging.service` depois do teste.
  Se o serviço falhar, regressar ao symlink da revisão anterior e
  verificar a compatibilidade da base antes de retomar.


## Reserva com email obrigatório e link privado (17/10/2026)

O cliente passa a ter de introduzir um endereço de email válido para
concluir a reserva. Sem o serviço de envio configurado, o endpoint devolve
**503 EMAIL_UNAVAILABLE ANTES de criar qualquer marcação**. Não são aceites
marcações que não tenham capacidade de serem confirmadas por email.

**Fluxo ao ativar após o Human Gate do remetente:**

1. O cliente escolhe serviço, profissional (ou livre), dia/hora, nome,
   telefone e **email obrigatório**. Não precisa de conta FADEGO.
2. A mesma transação PostgreSQL cria Cliente, Booking, token privado
   (apenas SHA-256) e **BookingEmailOutbox com o código encriptado AES-GCM**.
   Se um passo falhar, não existe reserva parcial.
3. Depois de a transação terminar, o servidor tenta enviar a confirmação
   diretamente via HTTPS Resend, com remetente verificado, endereço da
   barbearia, serviço, dia/hora inicial, código e URL privado
   `https://fadego.duckdns.org/r/CODIGO`. O fornecedor confirma a
   **aceitação do pedido**, não garante entrada na caixa de correio.
4. O mesmo link permite consultar o estado atual, **remarcar** e
   **cancelar** antes do início da reserva; as regras de disponibilidade
   e de isolamento entre barbearias já existentes continuam a ser usadas.
   Em alterações posteriores, o link original continua válido e mostra
   os dados atualizados.
5. Se o fornecedor falhar, a marcação mantém-se válida e a página privada
   assinala envio **pendente**. O trabalho encriptado fica no PostgreSQL
   e `fadego-booking-email.timer` tenta novamente de cinco em cinco
   minutos; os intervalos aumentam até no máximo uma hora por tentativa.
   Para não multiplicar emails, cada pedido utiliza um Idempotency-Key
   estável. O sistema não afirma que um email chegou só por haver HTTP 200.
6. Nenhum email sai dos testes de CI: os testes usam remetentes fictícios
   e transportes falsos. O cliente de envio não é invocado sem
   `BOOKING_EMAIL_PROVIDER=resend`, `BOOKING_EMAIL_FROM` válido,
   `BOOKING_EMAIL_API_KEY` e `NEXTAUTH_SECRET` carregados
   pelo ambiente autorizado.

**Human Gate real (já definido no projeto):** escolher/autorizar um serviço
de email transacional, domínio e endereço remetente verificáveis, tratamento
RGPD, custos, e ativação apenas na VPS de testes depois da autorização
do Supervisor. Foi implementado um adaptador opcional para Resend sem
dependências npm novas; não existe credencial nem conta Resend criada
automaticamente e o envio real **não está ativo**.

- Definir `BOOKING_EMAIL_PROVIDER=resend` e remetente/chave no cofre
  da VPS, nunca em Issues, GitHub, ficheiros de código ou screenshots.
- Usar chave de API de permissões **somente de envio** e, se disponível,
  restrita ao domínio remetente.
- Instalar/ativar **apenas após aprovação** os ficheiros
  `deploy/staging/native/fadego-booking-email.service` e
  `fadego-booking-email.timer` junto do serviço FADEGO. Não instalar
  um novo coordenador, cron geral, Docker, Nginx ou serviço de terceiros.
- Confirmar com uma reserva de demonstração autorizada que o email chega
  realmente e que o código abre `/r/...`, antes de aceitar dados reais.
- Vigiar quantos trabalhos permanecem pendentes, `attemptCount` e
  `lastErrorCode` **sem** publicar `sealedPayload`, emails ou tokens.
- Não alterar `NEXTAUTH_SECRET` enquanto existirem mensagens pendentes:
  a chave AES é derivada exclusivamente deste segredo. Uma rotação
  exige plano de migração/reencriptação dos trabalhos pendentes.
- Os códigos privados continuam a expirar 30 dias após o fim da reserva.
  Os registos cifrados de email devem entrar na política de retenção RGPD,
  que ainda carece de definição/aprovação; não apagar histórico existente
  arbitrariamente.

**Atualização:** além da confirmação inicial, o FADEGO prepara agora emails
individuais de **remarcação** (data anterior e nova data) e **cancelamento**.
Cada aviso é criado na **mesma transação de alteração**, sem enviar
emails dentro da transação. Os avisos são encriptados em repouso, cada um
com idempotência própria, e mantêm o mesmo link privado.

## Recuperação sem conta (implementação de código)

O cliente que perdeu o link abre `/b/{slug}/recuperar`, indica o email,
telefone e data local da reserva. Uma resposta pública **genérica** impede
que terceiros descubram se determinado cliente tem marcações.

- O serviço valida o tenant e identifica apenas uma reserva futura
  compatível com o email, telefone e dia. Não revela nomes, números ou
  confirmação de existência numa resposta pública.
- Apenas com o remetente autorizado ativo se cria uma notificação
  `RECOVERY`. A API pública **não faz envio síncrono** para impedir
  a descoberta de clientes por diferenças no tempo de resposta:
  o worker do FADEGO trata a fila. O link usa um token aleatório de
  **256 bits**. O PostgreSQL
  guarda só SHA-256 do token, com validade de **20 minutos**, sem acesso
  aos dados pessoais da reserva. O token no email é encriptado até à
  aceitação pelo fornecedor, quando o texto cifrado é apagado.
- Abrir `/recuperar/{token}` não altera nem revoga qualquer acesso: o
  cliente tem de carregar em **Recuperar acesso**. O servidor verifica que
  a notificação foi aceite para envio, não expirou nem foi utilizada.
- Depois de confirmada, a rotação do código privado e o consumo do token
  de recuperação são feitos **na mesma transação PostgreSQL**, com o
  bloqueio de tenant já usado no motor de reservas. Um segundo uso é
  recusado; o link antigo só deixa de funcionar nesse momento.
- As tentativas públicas de pedido e consumo de recuperação têm limites
  próprios por IP/identidade, com chaves hashed. O Nginx de staging não
  regista os URLs privados ou de recuperação, e as páginas têm
  `noindex`, `no-referrer`, `no-store`.
- Links de recuperação expirados não são enviados tardiamente:
  o worker descarta a notificação e limpa o conteúdo cifrado.
- As reservas antigas sem email mantêm o seu comportamento existente,
  incluindo a gestão através do código, sem imposição retroativa de
  contacto ou destruição do histórico.

**Limites atuais:** o remetente transacional real não está configurado nem
verificado; a aplicação não envia emails reais, nem está publicada na VPS.
A recuperação destina-se a reservas futuras, com email válido. A aprovação
do fornecedor, domínio e identidade do remetente, custos, regras RGPD,
prova real de entrega e autorização do Supervisor continuam a ser
Human Gates existentes. SMS e recuperação de password **administrativa**
permanecem fora do âmbito deste fluxo de clientes.
