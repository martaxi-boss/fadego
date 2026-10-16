import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireAuthenticatedActiveUser } from "@/lib/authorization"
import { db } from "@/lib/prisma"

export default async function AdminHomePage() {
  let user
  try {
    user = await requireAuthenticatedActiveUser()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login")
    }
    throw error
  }

  const isSuperAdmin = user.platformRole === "SUPER_ADMIN"
  const memberships = await db.barbershopMember.findMany({
    where: {
      userId: user.id,
      active: true,
      revokedAt: null,
    },
    select: {
      role: true,
      barbershop: {
        select: {
          name: true,
          slug: true,
          status: true,
        },
      },
    },
    orderBy: {
      barbershop: {
        name: "asc",
      },
    },
  })

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-gray-500">
        FADEGO
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{isSuperAdmin ? "Administração FADEGO" : "Escolher barbearia"}</h1>
      <p className="mt-2 text-gray-600">
        Apenas os acessos ativos associados à tua conta são apresentados.
      </p>

      <div className="mt-8 grid gap-4">
        {isSuperAdmin ? (
          <Link
            className="block rounded-2xl bg-slate-950 p-6 text-white shadow-lg transition hover:bg-slate-800"
            href="/super-admin"
          >
            <h2 className="text-lg font-semibold">Painel da plataforma →</h2>
            <p className="mt-2 text-sm text-slate-300">
              Indicadores gerais do FADEGO. Acesso exclusivo do SUPER_ADMIN.
            </p>
          </Link>
        ) : null}
        {memberships.map(({ barbershop, role }) => (
          <Link
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            href={`/admin/${barbershop.slug}`}
            key={barbershop.slug}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">{barbershop.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Código: {barbershop.slug} · {barbershop.status}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                {role}
              </span>
            </div>
          </Link>
        ))}
        {memberships.length === 0 && !isSuperAdmin ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Não existem barbearias atribuídas a esta conta.
          </p>
        ) : null}
      </div>
    </main>
  )
}
