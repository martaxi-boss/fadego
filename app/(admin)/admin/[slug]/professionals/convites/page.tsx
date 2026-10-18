import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import StaffInvitationForm from "./invitation-form"
import { revokeStaffInvitationAction } from "./actions"

export const dynamic = "force-dynamic"

export default async function StaffInvitationsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  if (access.membership.role === "STAFF") {
    redirect("/admin/" + slug + "/barbeiro")
  }
  const [members, invitations] = await Promise.all([
    db.staffMember.findMany({
      where: {
        barbershopId: access.barbershop.id,
        active: true, archivedAt: null, userId: null,
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.staffInvitation.findMany({
      where: { barbershopId: access.barbershop.id },
      select: {
        id: true, email: true, staffMemberId: true,
        expiresAt: true, redeemedAt: true, revokedAt: true, createdAt: true,
        staffMember: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ])
  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] bg-[#153e30] p-7 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-[#b3e8c6]">
          Gestão de acessos · {access.barbershop.name}
        </p>
        <h1 className="mt-3 text-3xl font-black">Convites para barbeiros</h1>
        <p className="mt-3 text-sm leading-6 text-[#d7eadd]">
          Cria o perfil em Profissionais, depois envia um convite individual.
          A conta liga-se automaticamente ao perfil e só acede à própria agenda.
        </p>
        <Link href={"/admin/" + slug + "/professionals"}
          className="mt-5 inline-block rounded-lg border border-white/50 px-4 py-2 text-sm font-bold">
          ← Voltar aos profissionais
        </Link>
      </header>
      <StaffInvitationForm slug={slug} available={members} />
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-black text-[#19412d]">Convites recentes</h2>
        <div className="mt-3 divide-y divide-gray-100">
          {invitations.map((invite) => {
            const active = !invite.redeemedAt && !invite.revokedAt &&
              invite.expiresAt > new Date()
            return (
              <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="text-sm">
                  <p className="font-bold">{invite.staffMember.name}</p>
                  <p className="break-all text-gray-500">{invite.email}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {invite.redeemedAt ? "Aceite" : invite.revokedAt ? "Revogado" :
                      active ? "À espera de aceitação" : "Expirado"}
                  </p>
                </div>
                {active ? (
                  <form action={revokeStaffInvitationAction.bind(null, slug, invite.id)}>
                    <button type="submit"
                      className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-bold text-rose-800">
                      Revogar
                    </button>
                  </form>
                ) : null}
              </div>
            )
          })}
          {invitations.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">Ainda não foram criados convites.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
