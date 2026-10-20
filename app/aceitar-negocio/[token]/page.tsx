import Link from "next/link"
import { auth } from "@/lib/auth"
import { lookupOwnerInvitation } from "@/lib/owner-invitations"
import { redeemOwnerInvitationAction } from "@/app/(super-admin)/super-admin/owner-invitation-actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Ativar o meu negócio | FADEGO", robots: { index: false, follow: false }, referrer: "no-referrer" }

export default async function AcceptOwnerPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ erro?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const invitation = await lookupOwnerInvitation(token)
  if (!invitation) return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-bold">Convite inválido ou expirado</h1>
    <p className="mt-3">Pede um novo convite à gestão FADEGO.</p>
    <Link href="/login?acesso=equipa" className="mt-4 inline-block underline">Entrar no meu negócio</Link>
  </main>
  const session = await auth()
  const user = invitation.membership.user
  const isNew = !user.active && user.onboardingPending
  const canAccept = isNew ? !session?.user?.id : session?.user?.id === user.id
  return <main className="min-h-screen bg-[#f3f8f3] px-5 py-12">
    <section className="mx-auto max-w-xl space-y-5 rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Convite pessoal · FADEGO</p>
      <h1 className="text-3xl font-bold text-emerald-950">O meu negócio</h1>
      <p className="font-semibold">{invitation.membership.barbershop.name}</p>
      <p className="break-all text-sm text-gray-600">{invitation.email}</p>
      {query.erro ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        {query.erro === "palavra-passe" ? "Usa pelo menos 12 caracteres e repete a mesma palavra-passe." :
          query.erro === "sessao" ? "Usa a conta indicada no convite. Para criar um acesso novo, termina primeiro a sessão atual." :
          "O convite já não pode ser utilizado. Pede outro à gestão FADEGO."}
      </p> : null}
      {canAccept ? <form action={redeemOwnerInvitationAction.bind(null, token)} className="space-y-4">
        {isNew ? <>
          <p className="text-sm text-gray-600">Escolhe a palavra-passe do teu negócio. Guarda-a contigo; não precisas de a enviar a ninguém.</p>
          <label className="block text-sm font-semibold">Nova palavra-passe
            <input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={512}
              required className="mt-2 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="block text-sm font-semibold">Repetir palavra-passe
            <input type="password" name="repeat" autoComplete="new-password" minLength={12} maxLength={512}
              required className="mt-2 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
        </> : <p className="text-sm text-gray-600">Confirma o acesso a este negócio com a tua conta existente. A tua palavra-passe mantém-se.</p>}
        <button type="submit" className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white">Ativar o meu acesso ao negócio</button>
      </form> : <div className="space-y-3 text-sm text-gray-600">
        <p>{isNew ? "Termina a sessão atual e abre este convite numa janela privada para criares o teu acesso." :
          "Entra com a conta deste email e volta a abrir o convite para confirmares o acesso."}</p>
        <Link href="/login?acesso=equipa" className="inline-block font-bold text-emerald-800 underline">Entrar com a minha conta</Link>
      </div>}
      <p className="text-xs leading-6 text-gray-500">Convite de utilização única, válido por 48 horas. A ativação do acesso permite preparar o negócio; as reservas públicas dependem da configuração e do Gmail da barbearia.</p>
    </section>
  </main>
}
