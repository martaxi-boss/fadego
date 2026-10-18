import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/prisma"
import { lookupStaffInvitation } from "@/lib/staff-invitations"
import { redeemStaffInvitationAction } from "@/app/(admin)/admin/[slug]/professionals/convites/actions"

export const dynamic = "force-dynamic"
export const metadata = {
  robots: { index: false, follow: false },
  title: "Aceitar convite da equipa | FADEGO",
}

export default async function AcceptStaffInvitePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { token } = await params
  const q = await searchParams
  const invitation = await lookupStaffInvitation(token)
  if (!invitation) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-2xl font-bold">Convite inválido ou expirado</h1>
        <p className="mt-3 text-sm text-gray-600">
          Pede um novo convite ao responsável da tua barbearia.
        </p>
        <Link href="/login?acesso=equipa" className="mt-4 inline-block underline">Entrar na equipa</Link>
      </main>
    )
  }
  const known = await db.user.findUnique({
    where: { email: invitation.email }, select: { id: true, active: true },
  })
  const session = await auth()
  const sameUser = known?.active && session?.user?.id === known.id
  return (
    <main className="min-h-screen bg-[#f3f8f3] p-5 py-12">
      <meta name="referrer" content="no-referrer" />
      <section className="mx-auto max-w-xl space-y-5 rounded-[2rem] border border-[#deebe0] bg-white p-7 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-widest text-[#26734c]">Convite privado · FADEGO</p>
        <h1 className="text-3xl font-black text-[#173f2d]">Acesso de barbeiro</h1>
        <p className="text-sm leading-6 text-gray-600">
          {invitation.barbershop.name} · {invitation.staffMember.name}
        </p>
        <p className="break-all rounded-lg bg-[#f3f8f4] p-3 text-sm font-semibold">{invitation.email}</p>
        {q.erro ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {q.erro === "palavra-passe" ? "As palavras-passe não coincidem ou são inválidas." :
            q.erro === "sessao" ? "Entra primeiro com a conta correspondente a este email." :
            "O convite já não está disponível. Pede outro ao responsável."}
        </p> : null}
        {known ? (
          sameUser ? (
            <form action={redeemStaffInvitationAction.bind(null, token)}>
              <p className="mb-4 text-sm text-gray-600">
                Já tens uma conta FADEGO. Confirma a associação a esta barbearia.
                A palavra-passe que já usas mantém-se.
              </p>
              <button className="rounded-lg bg-[#225d40] px-5 py-3 font-bold text-white">
                Aceitar e associar a minha conta
              </button>
            </form>
          ) : (
            <div>
              <p className="text-sm text-gray-600">
                Este email já tem conta FADEGO. Entra com essa conta e depois
                abre novamente o mesmo convite para confirmar a associação.
              </p>
              <Link href="/login?acesso=equipa"
                className="mt-4 inline-block rounded-lg bg-[#225d40] px-5 py-3 font-bold text-white">
                Entrar com a conta existente
              </Link>
            </div>
          )
        ) : (
          <form action={redeemStaffInvitationAction.bind(null, token)} className="space-y-4">
            <p className="text-sm text-gray-600">
              Define tu a palavra-passe do teu acesso. O dono da barbearia não
              a conhece e a plataforma não precisa de receber credenciais por mensagem.
            </p>
            <label className="block text-sm font-bold">Nova palavra-passe
              <input type="password" autoComplete="new-password" name="password"
                minLength={12} maxLength={512} required
                className="mt-2 block w-full rounded-lg border border-gray-300 p-3" />
            </label>
            <label className="block text-sm font-bold">Repetir palavra-passe
              <input type="password" autoComplete="new-password" name="repeat"
                minLength={12} maxLength={512} required
                className="mt-2 block w-full rounded-lg border border-gray-300 p-3" />
            </label>
            <button className="rounded-lg bg-[#225d40] px-5 py-3 font-bold text-white">
              Ativar o meu painel de barbeiro
            </button>
          </form>
        )}
        <p className="text-xs text-gray-500">
          Este convite é pessoal, de utilização única e expira ao fim de 48 horas.
          Nunca publiques o link.
        </p>
      </section>
    </main>
  )
}
