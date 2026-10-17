import { notFound } from "next/navigation"
import ConfigNotice from "@/app/_components/config-notice"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import { gmailOAuthConfig, gmailLiveSendReady } from "@/lib/gmail-oauth"
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
    select: { contactEmail: true },
  })
  if (!shop) notFound()
  const gmail = await db.gmailSenderConnection.findUnique({
    where: { barbershopId: access.barbershop.id },
    select: { email: true, sendingEnabledAt: true },
  })
  const oauthReady = gmailOAuthConfig() !== null
  const liveGmailReady = gmailLiveSendReady()
  const notice = typeof query.notice === "string" ? query.notice : ""

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Gmail das reservas</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">
          Para receber reservas pelo FADEGO, cada barbearia precisa de ligar
          o Gmail do seu próprio negócio. Se ainda não tiver Gmail, pode criar
          uma conta e ligá-la aqui. Não são necessárias caixas de email dos
          subdomínios FADEGO nem acesso ao Gmail pessoal da administração.
        </p>
        <p className="mt-2 text-sm leading-7 text-gray-600">
          Os clientes da barbearia não ligam contas Google: apenas indicam o
          seu endereço de email para receber a confirmação e o link privado
          que permite consultar, alterar ou cancelar a reserva.
        </p>
      </section>
      <ConfigNotice notice={notice} />
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ligar o Gmail do negócio</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-600">
          Liga o Gmail que pertence à tua barbearia através da página oficial
          da Google. Esta é a única ligação de envio disponível no FADEGO.
          A Google autoriza apenas o envio de mensagens e a identificação
          da conta: não lemos a caixa de correio nem pedimos a palavra-passe.
          A ligação por si só não ativa os envios.
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
          {!gmail
            ? "Estado: Gmail do negócio por ligar."
            : gmail.sendingEnabledAt && liveGmailReady
              ? "Estado: envio autorizado nesta barbearia."
              : gmail.sendingEnabledAt
                ? "Estado: ligação autorizada, mas o envio está bloqueado na plataforma."
                : "Estado: Gmail ligado, mas envios automáticos desativados."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {oauthReady ? (
            <form action={connectGmailAction.bind(null, access.barbershop.slug)}>
              <button type="submit"
                className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white">
                {gmail ? "Mudar Gmail do negócio" : "Ligar o Gmail do negócio com a Google"}
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
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Email para receber respostas (opcional)</h2>
        <p className="mt-2 text-sm leading-7 text-gray-600">
          Se deixares este campo vazio, as respostas vão para o Gmail que ligaste.
          Só precisas de o preencher se quiseres receber respostas noutro endereço.
          Este campo não liga outro fornecedor de envio e não altera a conta Gmail
          que envia as confirmações.
        </p>
        <form action={updateBarbershopContactEmailAction.bind(null, access.barbershop.slug)}
          className="mt-4 max-w-xl space-y-4">
          <label className="block text-sm font-medium text-gray-800">
            Email para respostas
            <input
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3"
              name="contactEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="barbearia@gmail.com"
              defaultValue={shop.contactEmail ?? ""}
            />
          </label>
          <p className="text-xs leading-6 text-gray-600">
            Os links privados e códigos das reservas são enviados só ao cliente,
            não para este endereço de contacto.
          </p>
          <button className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            type="submit">Guardar email para respostas</button>
        </form>
      </section>
    </div>
  )
}
