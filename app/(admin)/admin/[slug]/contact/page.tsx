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
    select: { contactEmail: true },
  })
  if (!shop) notFound()
  const notice = typeof query.notice === "string" ? query.notice : ""

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Email da barbearia</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">
          Cada barbearia pode indicar um email próprio ou já existente.
          As confirmações são enviadas ao cliente pelo remetente verificado
          do FADEGO e as respostas são dirigidas à barbearia.
          O envio real permanece desativado até existir autorização.
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
            Para testes, podes indicar um email teu. O contacto não se torna
            automaticamente um remetente autenticado.
          </p>
          <button className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            type="submit">Guardar email</button>
        </form>
      </section>
    </div>
  )
}
