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
