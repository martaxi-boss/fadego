# FADEGO — subdomínio automático e três entradas de cada negócio

## Arquitetura aprovada

- Site institucional e Super Admin ficam no hostname canónico configurado em NEXTAUTH_URL.
- O Owner regista um negócio uma única vez no Super Admin, com slug reservado e conta SUSPENDED até ativação segura. Sem DNS ou mailbox por barbearia.
- O subdomínio público de cada barbearia é gerado por convenção: `{slug}.{FADEGO_TENANT_BASE_DOMAIN}`. A configuração DNS wildcard e HTTPS TLS wildcard **é única por domínio base**, pelo que não há necessidade de chamadas DNS por cada registo. As rotas usam a mesma app Next.js, a mesma base de dados isolada por barbershopId e o mesmo serviço.
- No subdomínio, `/` abre a entrada do estabelecimento, `/marcar` as reservas, `/cliente` a recuperação das reservas; `/gestao` e `/equipa` encaminham para o portal canónico protegido do negócio, respetivamente para a administração da barbearia e o painel individual do funcionário.
- Proprietário e ADMIN possuem gestão de Gmail do seu negócio via OAuth Google; STAFF não tem permissões para este módulo. Nunca é necessário dar as credenciais Gmail ao Owner FADEGO.
- O cliente **não** tem conta User: marca com email obrigatório e usa link/código privado para consultar, remarcar, cancelar e recuperar. `/r/[code]` mantém proteções originais. O pessoal tem User+BarbershopMember autenticado; StaffMember é entidade operacional e não é automaticamente login.
- A autenticação NextAuth continua host-only e só no hostname canónico. Não se distribuem cookies de SUPER_ADMIN entre subdomínios. Todas as Server Actions conservam autorização explícita por tenant, role e registo; Proxy não é um mecanismo de autorização.

## Portas de ativação da infraestrutura — ainda fechadas

Nenhum subdomínio é anunciado como operacional sem concluir e provar:
1. Identificar e confirmar o domínio base de utilização comercial autorizado pelo Owner. `fadego.duckdns.org` é staging, não supor que o wildcard DNS/HTTPS do fornecedor está preparado só porque a raiz funciona.
2. Apontar `*.base` ao serviço existente (DNS A/AAAA ou CNAME controlado). Verificar resolução de dois nomes de barbearia e um nome inexistente; controlar a política de 404.
3. Instalar certificado TLS wildcard válido, testar HTTPS com SNI distinto e configurar **somente o vhost FADEGO** para encaminhar o Host original ao Next.js. Nunca abrir acesso aos outros projetos da VPS nem remover o Basic existente de APIs privadas.
4. Confirmar que o site institucional permanece exclusivo do seu Host, que o portal da plataforma não pode ser servido como tenant público, e que host inválido/não registado não revela dados de outros negócios.
5. Na app FADEGO, só após estas provas, definir `FADEGO_TENANT_BASE_DOMAIN=dominio-autorizado` e `FADEGO_TENANT_SUBDOMAINS_READY=true`. Ambos são necessários. Antes disso, o comportamento atual `/b/{slug}` continua sem alteração.
6. Executar regressão real de navegador (cliente, staff, OWNER) e isolamento por barbershopId, callback Gmail no hostname canónico, proteção HTTPS e rollback. Só depois oferecer endereços individuais aos comerciantes.

Criar a conta não liga nem autoriza Gmail, não ativa automaticamente o negócio e não envia emails. `BOOKING_EMAIL_PROVIDER=disabled` e `GMAIL_LIVE_SEND_ENABLED=false` mantêm-se. Não são criadas caixas de email pagas no subdomínio. Cada negócio liga Gmail seu e faz consentimento Google; a verificação da aplicação OAuth Google poderá ser necessária antes da comercialização.

## Próximas dependências independentes

- Onboarding seguro dos empresários (convite verificado/definição das próprias credenciais) antes de ativar barbearias reais; não criar passwords conhecidas do FADEGO.
- Horários e folgas **individuais** por profissional; o horário semanal do negócio e cadeiras são as bases existentes.
- Suporte de subdomínio verdadeiro depende exclusivamente da configuração e verificação DNS/TLS descrita acima, não de novo painel, agente ou servidor.
