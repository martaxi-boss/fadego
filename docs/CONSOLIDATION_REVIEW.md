# FADEGO — revisão integrada de 20/10/2026

## Percursos de revisão

- Portal central: `/super-admin/barbearias` → criar negócio suspenso → abrir
  detalhes → «Convidar proprietário». Entregar o link de utilização única por
  canal privado ao endereço indicado. Expira em 48 horas; renovar revoga o
  anterior. «Revogar convite pendente» invalida-o imediatamente.
- O proprietário abre `/aceitar-negocio/[token]`, escolhe a própria palavra-passe
  se for uma identidade nova, e entra em `/login?acesso=equipa`. Uma conta
  previamente ativa tem de iniciar sessão nessa mesma identidade antes de aceitar.
  O convite não altera a palavra-passe de uma conta existente.
- O painel do negócio permite configurar serviços, preços, cadeiras, profissionais,
  horários e Club. A gestão central só ativa o negócio após configuração mínima.
- Agenda `/admin/[slug]/agenda`: alternar Dia/Semana, escolher data, profissional
  e estado; navegar entre semanas e voltar a Hoje. O calendário identifica o
  atendimento, serviço e estado; selecionar uma marcação abre os detalhes e ações
  na lista. A vista diária organiza por profissional; a semanal começa à segunda.
- Barbeiro `/admin/[slug]/barbeiro`: mesmas vistas, data livre e apenas reservas
  do perfil autenticado; os gestores podem pré-visualizar um profissional. Horários,
  pausas, folgas, férias e novas marcações continuam no planeamento já existente.
- No telemóvel, a grelha desloca-se dentro do calendário, com lista de detalhes
  acessível por baixo. Marcações simultâneas recebem posições distintas.

## Fronteiras do acesso

O convite do proprietário concede apenas o papel OWNER da pertença previamente
criada pelo SUPER_ADMIN. Não cria SUPER_ADMIN, não restaura pertenças revogadas,
não recupera contas suspensas e não ativa reservas/Gmail. O marcador
`User.onboardingPending` só é definido na criação de uma identidade nova por este
fluxo. A migração mantém contas históricas inalteradas e com marcador falso;
identidades antigas inativas precisam de recuperação separadamente autorizada,
nunca de ativação automática. O token é guardado só como SHA-256 e consumido
atomicamente; ativação e consumo fazem parte da mesma transação.

Tal como os convites STAFF do piloto, a entrega manual do link é confidencial e
não constitui verificação automática de posse do email. Nunca colocar links,
palavras-passe ou dados reais em GitHub/Actions/chats. Nenhum convite real é enviado
pela implementação ou pelos testes. A homologação usa apenas dados sintéticos.

## Validação e publicação

Testes focados de calendário cobrem viragem de semana/ano, ano bissexto, UTC,
Lisboa/DST e posicionamento de reservas simultâneas. A CI obrigatória conserva
migrações, testes DB, TypeScript, lint, build, secret scan, backup/restauro e E2E.
E2E acrescenta agenda semanal OWNER/STAFF, seleção de detalhes, viewport de 390px,
tentativa de escolher outro profissional e ativação de proprietário por convite.
As capturas reais acrescentam a agenda semanal desktop e móvel.

A publicação privada deve usar exclusivamente o encaminhamento GitHub/Actions
existente: certificar SHA exato, backup staging antes da migração aditiva,
preservar rollback e credenciais existentes, confirmar login e isolamento após
deploy. Não anunciar uma versão como instalada apenas porque a CI passou.

## Dependências para funcionamento comercial

- Consentimento Google de cada negócio e teste controlado real do envio Gmail.
- Domínio definitivo com DNS e TLS wildcard antes de ativar subdomínios.
- Aceitação visual e operacional do piloto pelo proprietário.
- Processamento de pagamentos continua fora da integração atual.

Não ativar emails, pagamentos ou reservas reais apenas para demonstrar o fluxo.
