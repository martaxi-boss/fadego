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
      <h1 className="mt-3 text-3xl font-semibold">Escolher barbearia</h1>
      <p className="mt-2 text-gray-600">
        Apenas memberships ativas ligadas à identidade autenticada são
        apresentadas.
      </p>

      <div className="mt-8 grid gap-4">
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
                  {barbershop.slug}.fadego.pt
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                {role}
              </span>
            </div>
          </Link>
        ))}
        {memberships.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Esta identidade não possui memberships ativas.
          </p>
        ) : null}
      </div>
    </main>
  )
}
