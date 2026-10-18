# FADEGO — agenda operacional individual dos barbeiros (candidato de 18/10/2026)

## A mesma plataforma, um só motor de reservas

O Super Admin FADEGO cria o negócio. O proprietário/administrador da barbearia mantém a
agenda geral, os serviços, as cadeiras, os preços, os colaboradores e a ligação ao Gmail.
O barbeiro autenticado em `/admin/[slug]/barbeiro` só pode consultar/operar
reservas do seu `StaffMember`, resolvido em servidor por `User.id` mais
`BarbershopMember(STAFF)`. A query `professional` enviada por um STAFF é ignorada.
O responsável pode pré-visualizar/planear o barbeiro da própria barbearia, nunca de outro tenant.

### Reserva, reagendamento, cancelamento e finalização
- O funcionário cria marcação com nome, telefone e **email obrigatório**.
  A barbearia tem de estar ACTIVE e o seu Gmail OAuth apto a enviar; senão a operação é
  recusada sem criar reserva. A UI explica o bloqueio e permite continuar a preparar horários.
- A marcação usa `createBookingInTransaction`: lock de tenant, verificação de abertura,
  intervalos de 15 min, capacidade de cadeira, conflitos por profissional, folgas/pausas e
  mesma validação usada no booking público. A cliente recebe código privado via outbox
  criptográfica transacional; envio fora da transação. Nunca aparece o código na UI STAFF.
- Reagendar preserva serviço e profissional; calcula horários livres com exclusão do booking
  original, faz a operação sob o mesmo lock e emite novo acesso privado apenas por email.
- Cancelar/concluir/falta usam as transições protegidas do motor já existente, com a condição
  **obrigatória sob lock** de que `booking.staffMemberId` é o perfil autorizado. Enviar
  alteração por outbox após commit; nunca conceder ações em reservas de colegas.
- Administradores continuam com as ferramentas completas de gestão e reatribuição.

### Horário de trabalho, pausas, folgas e férias
- `StaffWeeklyHour`: segunda a domingo; ausente significa horário da barbearia;
  override só pode reduzir disponibilidade (o motor sempre valida abertura da barbearia).
- `StaffScheduleBlock`: data local e minutos do dia; suporta dia inteiro, pausa parcial ou férias
  dia-a-dia. Todas as alterações partilham o mesmo advisory lock de reservas e **recusam
  bloquear horas com reservas futuras**. A UI também permite remover bloqueio.
- Disponibilidade pública e alocação transacional consultam os mesmos horários individuais,
  evitando expor a um cliente um horário que o motor depois aceitaria contra uma folga.
- Conversões de data e DST seguem o timezone IANA do negócio; slots que atravessem
  o dia local permanecem recusados.

### Acesso individual e convites
- O dono regista um perfil em Profissionais e emite convite específico por email da pessoa,
  válido por 48h, token aleatório guardado **só como SHA-256**, consumo único.
- O link aparece uma vez no painel do responsável, para entrega privada ao funcionário.
  Nenhuma conta Gmail do Owner é reutilizada; não cria password conhecida pelo dono.
- Quem ainda não tem conta escolhe a própria palavra-passe de funcionário; quem já tem
  conta FADEGO **tem de autenticar-se nessa mesma conta** antes de aceitar.
- Um convite nunca cria utilizadores SUPER_ADMIN, nunca ativa pertenças revogadas,
  nunca move perfil de outro tenant, nem sobrepõe identidades já atribuídas.
- O serviço de convite independente de Gmail é um **mecanismo de distribuição manual
  e confidencial** nesta fase piloto; não constitui verificação automática de posse do
  email do colaborador. O Owner tem de enviar o link ao destinatário por canal seguro.
  No lançamento, o envio automático depende da ligação do Gmail do negócio e dos
  consentimentos Google habilitados.

## Limites de lançamento mantidos
O piloto staging `fadego.duckdns.org` continua com envio Gmail real desligado,
barbearia de demonstração SUSPENDED, sem pagamentos, sem subdomínio comercial/HTTPS wildcard.
Isso permite consultar a agenda e preparar a disponibilidade, mas bloqueia
novas reservas que exigiriam email real. Nenhuma alteração de DNS/VPS/credenciais
é parte desta implementação.

A migração Prisma é **aditiva** (3 tabelas com FK compostas por tenant) e não altera
nem apaga reservas existentes; antes de qualquer staging deploy exige backup/validação
da base staging, full CI, rollback de código e certificação pós-deploy.
