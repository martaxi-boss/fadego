import { notFound } from "next/navigation"
import ConfigNotice from "@/app/_components/config-notice"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
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
  const notice = typeof query.notice === "string" ? query.notice : ""

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Email da barbearia</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">
          A tua barbearia escolhe um nome de endereço FADEGO para enviar
          confirmações aos clientes. Podes também usar o teu Gmail ou outro
          email de contacto para receber as respostas. Para enviar diretamente
          através de uma conta externa, será necessário ligá-la e autorizar o
          acesso. O envio real permanece desativado até à ativação aprovada.
        </p>
      </section>
      <ConfigNotice notice={notice} />
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
    </div>
  )
}
