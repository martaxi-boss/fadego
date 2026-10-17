import { notFound } from "next/navigation"
import ConfigNotice from "@/app/_components/config-notice"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import { gmailOAuthConfig, gmailLiveSendReady } from "@/lib/gmail-oauth"
import { bookingEmailProviderReady } from "@/lib/booking-email"
import { connectGmailAction, activateGmailAction, pauseGmailAction, disconnectGmailAction } from "../gmail-actions"
import { updateBarbershopContactEmailAction } from "../actions"

export default async function BarbershopContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ notice?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  if (access.membership.role === "STAFF") notFound()
  const shop = await db.barbershop.findUnique({
    where: { id: access.barbershop.id },
    select: { contactEmail: true, senderAlias: true },
  })
  if (!shop) notFound()
  const gmail = await db.gmailSenderConnection.findUnique({
    where: { barbershopId: access.barbershop.id },
    select: { email: true, sendingEnabledAt: true },
  })
  const oauthReady = gmailOAuthConfig() !== null
  const liveGmailReady = gmailLiveSendReady()
  const platformSendingReady = process.env.BOOKING_EMAIL_PROVIDER === "resend" && bookingEmailProviderReady()
  const notice = typeof query.notice === "string" ? query.notice : ""

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Emails das reservas</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">
          A tua barbearia pode preparar um endereço de envio FADEGO, associado
          ao domínio verificado da plataforma, ou ligar o seu próprio Gmail.
          São opções distintas: indicar um email de contacto não autoriza envios.
          O envio real depende da configuração e da aprovação da plataforma.
        </p>
      </section>
      <ConfigNotice notice={notice} />
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Opção 1 — endereço de envio FADEGO</h2>
        <p className="mt-2 text-sm leading-7 text-gray-600">
          Este endereço usa o domínio verificado do FADEGO quando o serviço de envio
          estiver aprovado. Não cria uma caixa de correio nem tem um custo individual
          automático por barbearia. As respostas seguem para o email de contacto.
        </p>
        <p className="mt-3 text-sm font-medium text-gray-700" role="status">
          {platformSendingReady
            ? "Estado: serviço de envio do domínio configurado."
            : "Estado: envio pelo domínio ainda indisponível nesta instalação."}
        </p>
        <form action={updateBarbershopContactEmailAction.bind(null, access.barbershop.slug)}
          className="max-w-xl space-y-4">
          <label className="block text-sm font-medium text-gray-800">
            Email de contacto
            <input
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3"
              name="contactEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="barbearia@exemplo.pt"
              defaultValue={shop.contactEmail ?? ""}
            />
          </label>
          <p className="text-xs leading-6 text-gray-600">
            Para testes, podes indicar um email teu. O contacto receberá as
            respostas dos clientes, não os códigos privados das reservas.
          </p>
          <label className="block text-sm font-medium text-gray-800">
            Nome escolhido para o email de envio FADEGO
            <input
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3"
              name="senderAlias"
              autoComplete="off"
              maxLength={32}
              pattern="[a-zA-Z0-9][a-zA-Z0-9-]*"
              title="Letras, números e hífen"
              placeholder="reservas"
              defaultValue={shop.senderAlias ?? ""}
            />
          </label>
          <p className="text-xs leading-6 text-gray-600">
            Exemplo: se escolheres «cortes», será utilizado o prefixo «cortes»
            seguido do identificador da barbearia e do domínio verificado do
            FADEGO. Assim, cada barbearia tem um endereço próprio e as
            respostas vão para o email de contacto indicado acima.
            Deixa vazio para usar «reservas».
          </p>
          <p className="text-xs leading-6 text-gray-600">
            Um endereço externo, como o Gmail, só poderá ser usado
            diretamente como remetente depois de o titular autorizar essa conta.
            Não pedimos a palavra-passe da caixa de correio.
          </p>
          <button className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            type="submit">Guardar email</button>
        </form>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Opção 2 — Gmail próprio da barbearia</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-600">
          Liga a tua conta pela página oficial da Google. O FADEGO pede apenas
          autorização para enviar mensagens com o Gmail e identificar a conta.
          Não lê emails, não pede a palavra-passe e não ativa os envios
          automaticamente depois da ligação.
        </p>
        <p className="mt-2 text-xs leading-6 text-gray-600">
          O email de apoio do FADEGO pode aparecer na autorização da Google
          dirigida ao dono da barbearia. Não é mostrado aos clientes na página
          pública de reservas e não será usado como remetente da barbearia.
        </p>
        <p className="mt-3 text-sm font-semibold">
          {gmail ? "Conta ligada: " + gmail.email : "Nenhuma conta Gmail ligada."}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {!gmail ? "Estado: por configurar." : gmail.sendingEnabledAt
            ? "Estado: envio autorizado nesta barbearia."
            : "Estado: ligada, mas envios automáticos desativados."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {oauthReady ? (
            <form action={connectGmailAction.bind(null, access.barbershop.slug)}>
              <button type="submit"
                className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white">
                {gmail ? "Ligar outro Gmail" : "Ligar o meu Gmail com a Google"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-amber-800">
              Ligação Google ainda indisponível: falta configurar o cliente OAuth
              e o cofre de segredos num ambiente HTTPS aprovado.
            </p>
          )}
          {gmail ? (
            <form action={disconnectGmailAction.bind(null, access.barbershop.slug)}>
              <button type="submit" className="rounded-lg border border-gray-300 px-5 py-3 text-sm">
                Desligar Gmail
              </button>
            </form>
          ) : null}
        </div>
        {gmail && liveGmailReady ? (
          gmail.sendingEnabledAt ? (
            <form className="mt-5" action={pauseGmailAction.bind(null, access.barbershop.slug)}>
              <button type="submit" className="rounded-lg border border-red-300 px-5 py-3 text-sm">
                Pausar envios pelo Gmail
              </button>
            </form>
          ) : (
            <form className="mt-5 space-y-3"
              action={activateGmailAction.bind(null, access.barbershop.slug)}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirmGmailSending" value="authorize"
                  required className="mt-1" />
                Confirmo que sou o titular autorizado e quero ativar o envio
                de confirmações pelo Gmail desta barbearia.
              </label>
              <button type="submit"
                className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white">
                Autorizar envio de reservas pelo Gmail
              </button>
            </form>
          )
        ) : (
          <p className="mt-4 text-sm text-amber-800">
            O envio real continua bloqueado pela plataforma. Não serão
            enviados emails durante a preparação nem ao concluir o OAuth.
          </p>
        )}
        <p className="mt-4 text-xs leading-6 text-gray-500">
          Se desligares a conta, o FADEGO apaga localmente a credencial de acesso.
          Podes também revogar a permissão na página de segurança da tua Conta Google.
        </p>
      </section>
    </div>
  )
}
