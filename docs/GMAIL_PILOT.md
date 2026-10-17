# FADEGO — piloto de envio pelo próprio Gmail (sem SMS ou WhatsApp)

## Objetivo e limites

Cada barbearia pode escolher **o seu próprio Gmail** para enviar confirmações a clientes. A ligação só é iniciada pelo OWNER/ADMIN da barbearia, no FADEGO. As respostas podem ir para o email de contacto configurado. **Nem ligar o Gmail nem publicar a aplicação envia automaticamente mensagens.**

O piloto usa apenas a permissão sensível `https://www.googleapis.com/auth/gmail.send` (mais `openid email` para confirmar qual a conta ligada). Não permite ler mensagens. Não se pede uma palavra-passe de Gmail, nem se guardam códigos de autorização em logs.

## Requisitos externos — Human Gates reais

1. Um operador autorizado configura **Google Cloud → Gmail API** e **Google Auth Platform → OAuth consent** num projeto Google controlado pelo Owner. Em modo `Testing`, adicionar o próprio Gmail como utilizador de teste. A Google pode requerer verificação para disponibilizar este serviço comercialmente a outras barbearias.
2. Criar **OAuth Client ID do tipo Web application** e autorizar exatamente a URI de retorno `https://fadego.duckdns.org/api/integrations/gmail/callback` **se e só se a Google a aceitar**. A propriedade/verificação de um domínio DuckDNS no Google Auth Platform não está certificada; se a plataforma recusar, decidir primeiro um domínio verificável, nunca contornar a validação.
3. Só após aprovação do Supervisor para o staging FADEGO (no PR #15), preparar a app isolada em HTTPS, base PostgreSQL própria e guardar no cofre aprovado `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET` e um `GMAIL_TOKEN_ENCRYPTION_SECRET` aleatório de comprimento >=32 bytes. Nunca colocar segredos em issues, chat, repositório ou variáveis do navegador.
4. Com `BOOKING_EMAIL_PROVIDER=disabled` e `GMAIL_LIVE_SEND_ENABLED=false`, o proprietário faz login no **FADEGO**, abre `/admin/{slug}/contact` e escolhe **Ligar o meu Gmail com a Google**. O site encaminha para a Google, que apresenta a permissão de envio. Ao voltar, a app valida OAuth/PKCE/estado/utilizador/barbearia, guarda o refresh token cifrado e mantém `sendingEnabledAt=null`. Um consentimento recuado ou expirado não liga a conta.
5. **Nova autorização material específica:** quando estiver tudo validado e aprovado, o Supervisor autoriza alterar o ambiente para `BOOKING_EMAIL_PROVIDER=gmail` e `GMAIL_LIVE_SEND_ENABLED=true`. O proprietário confirma adicionalmente na área FADEGO que quer **ativar os envios** para aquela barbearia. Só depois a plataforma aceita reservas públicas por aquele Gmail.
6. Realizar **uma única reserva fictícia** com a própria caixa do Owner como destinatário. Confirmar o cabeçalho `From` correto, `Reply-To`, código privado, alterações e cancelamentos, antes de aceitar outros clientes. Não usar identidades ou endereços de terceiros sem consentimento.

## Comportamento e recuperação

- Cada ligação é isolada pelo `barbershopId`; os tentativos OAuth só valem para o mesmo administrador que os iniciou durante dez minutos; o `state` é de utilização única. Reconectar substitui a conta e volta a desativar o envio.
- O botão **Pausar** remove autorização local de envio. **Desligar Gmail** apaga a credencial cifrada da base FADEGO; o titular pode também revogar autorização em [Conta Google → Ligações com apps de terceiros](https://myaccount.google.com/connections).
- O envio via Gmail usa `users.messages.send` com mensagem MIME UTF-8 e `From` correspondente ao email autorizado. Em caso de resposta ambígua da API, não reenvia automaticamente para impedir mensagens duplicadas. O histórico da app marca `GMAIL_UNCERTAIN`; verificar manualmente a caixa `Enviados`.
- A quota gratuita e os limites anti-spam do Gmail **não tornam a conta indicada adequada para envios comerciais em grande escala**. Antes da comercialização, rever limites, Google API User Data Policy, RGPD, política de privacidade, verificação OAuth e um fornecedor transacional profissional.

Fontes oficiais:
- [Gmail API — scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gestão dos utilizadores de teste OAuth](https://support.google.com/cloud/answer/15549945)

## Configuração real do piloto pelo Owner (17/10/2026)

O Owner concluiu no Google Cloud o projeto de teste, a ativação da Gmail API,
a criação do cliente OAuth Web com o callback de testes, a audiência **Externa /
Testando**, um utilizador de teste e o consentimento para `gmail.send`.
No ConnectBot foi observado `COFRE_OK` para o ficheiro privado
`/root/project-secrets/fadego-gmail/oauth.env`: isto confirma **apenas**
que o ficheiro existe e não está vazio, não a validade do Client Secret ou
o sucesso do intercâmbio OAuth. Não copiar o seu conteúdo para GitHub ou chat.
Nenhum envio real, consentimento OAuth na aplicação, merge ou deploy foi provado.

O email de suporte escolhido no Google Auth Platform **pode aparecer ao dono
da barbearia no ecrã de consentimento da Google**, mas não é um contacto
exposto no catálogo público de reservas e nunca é usado como remetente
das mensagens de outra barbearia.

O código conserva internamente dois transportes históricos, mas **o painel
do piloto mostra apenas Gmail próprio por barbearia**; o transporte
transacional do domínio está inativo e reservado para uma decisão
futura do Owner. `BOOKING_EMAIL_PROVIDER` é global e permanece
`disabled` no primeiro arranque, tal como
`GMAIL_LIVE_SEND_ENABLED=false`. Um subdomínio não cria uma caixa
de correio nem é necessário pagar um email separado por barbearia.

## Preparação do piloto Gmail sem domínio comercial

A prioridade atual do Owner é experimentar o Gmail já configurado;
não esperar pela compra do domínio comercial nem criar novos remetentes.
O teste de integração começa com `BOOKING_EMAIL_PROVIDER=disabled`
e `GMAIL_LIVE_SEND_ENABLED=false`. A autorização da conta Google
pode ser demonstrada apenas após existir staging HTTPS isolado, autenticação
de testes e aprovação do Supervisor. Nenhum botão do painel ou consentimento
Google envia automaticamente uma mensagem.

O contrato do cofre pode ser verificado **na VPS autorizada** com
`sudo python3 scripts/check-gmail-vault.py` **depois** de instalar a
revisão aprovada do FADEGO. A verificação é somente de leitura, não faz
requisições à Google, não imprime valores nem altera o cofre. Devolve
apenas `FADEGO_GMAIL_VAULT=READY` ou `FADEGO_GMAIL_VAULT=NOT_READY`.
O GitHub CI executa **apenas** a verificação sintética `--self-test`,
nunca acede às credenciais reais da VPS. A validade do Client Secret
só pode ser comprovada pelo fluxo OAuth com consentimento real.

O trabalhador Gmail também confirma que a barbearia continua `ACTIVE`
antes e depois da troca remota de token; suspensões durante a chamada
bloqueiam o envio. As novas capturas CI incluem os ecrãs de configuração
de email no computador e no telemóvel, com dados fictícios.

## Ligação do cofre existente ao staging nativo (pré-preparada, sem deploy)

O ambiente de teste não deve voltar a pedir ao Owner as chaves já guardadas.
As duas unidades systemd de staging (`fadego-staging.service` e
`fadego-booking-email.service`) leem diretamente, como último
`EnvironmentFile` opcional, o ficheiro protegido
`/root/project-secrets/fadego-gmail/oauth.env`. É o gestor de serviços
systemd (PID 1), ainda com permissões root, que abre o ficheiro antes de
iniciar os processos com o utilizador isolado `fadego-staging`. Não se
copia o segredo para o GitHub nem se expõem os seus valores nos logs.

O ficheiro `/etc/fadego-staging/app.env` continua a conter as outras
variáveis necessárias ao staging (base de dados independente, NextAuth,
URL HTTPS) e é lido **primeiro**. As definições Gmail do cofre são lidas
**depois**, de modo que os bloqueios atuais
`BOOKING_EMAIL_PROVIDER=disabled` e `GMAIL_LIVE_SEND_ENABLED=false`
prevaleçam. Não criar credenciais Gmail duplicadas no ficheiro de staging.
Se o cofre não existir, o serviço pode arrancar mas o botão OAuth fica
indisponível; a operação de envio falha fechada. O verificador seguro
`scripts/check-gmail-vault.py` tem de devolver `READY` na VPS real
antes de considerar o piloto operacional.

A futura autorização de envios reais requer procedimento próprio do
Supervisor, alteração explicitamente aprovada das portas globais, ligação
OAuth pessoal no FADEGO e consentimento da barbearia; a mera leitura do
cofre não concede autorização de envio. Nem estas alterações nem os
ensaios CI instalam unidades systemd ou abrem portas no servidor.

## Regra comercial atual — apenas Gmail por barbearia

Cada negócio é obrigado a possuir/criar o **seu próprio Gmail**, que
liga no painel por OAuth da Google. A conta de apoio do FADEGO fica
exclusivamente para administração, teste e contacto no consentimento
Google; **não envia reservas em nome de todos os parceiros**.
Não há integrações Outlook, SMTP de terceiros ou caixas de email pagas
dos subdomínios. O subdomínio é endereço web do negócio.

O cliente final **não autoriza o Google**: introduz o email obrigatório
para receber reserva, link privado, alterações, cancelamentos e recuperação.
O contacto de respostas é opcional: se vazio, as respostas seguem para
o Gmail autorizado; se preenchido, apenas define Reply-To, sem ativar
nenhum fornecedor adicional.

O painel de teste mostra **apenas Gmail** e as respostas opcionais.
O alias antigo para o domínio de envio da plataforma mantém-se
guardado na base de dados, mas desaparece do painel e não é apagado
ao editar o contacto. Quando o Owner decidir ativar o email de domínio
mais tarde, a migração será tratada separadamente sem recomeçar o OAuth.
Para utilização por parceiros fora dos testadores, a publicação e
verificação da aplicação OAuth Google ainda são necessárias.
Os envios reais continuam fechados em desenvolvimento.

## Segurança do primeiro build no staging

O modelo `deploy/staging/native/runtime.env.example` contém só
credenciais não Google e os dois bloqueios de envio desligado.
O script `build-release.sh` agora **recusa preparar um release**
se `BOOKING_EMAIL_PROVIDER` não for exatamente `disabled` ou se
`GMAIL_LIVE_SEND_ENABLED` não for exatamente `false`.
A regra não substitui autorização do Supervisor. Depois da
primeira demonstração e de consentimento Google válido, o envio
de um teste requer uma transição operacional aprovada separadamente.
