import Link from "next/link"
import { db } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function SuperAdminPage() {
  const [shops, activeShops, bookings, customers, clubMembers, activeSubscriptions, linkedGmail, recentShops] =
    await Promise.all([
      db.barbershop.count(),
      db.barbershop.count({ where: { status: "ACTIVE" } }),
      db.booking.count(),
      db.customer.count(),
      db.membership.count(),
      db.platformSubscription.count({ where: { status: "ACTIVE" } }),
      db.gmailSenderConnection.count(),
      db.barbershop.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          gmailSenderConnection: { select: { id: true } },
          _count: { select: { bookings: true, customers: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
      }),
    ])

  const metrics = [
    { label: "Barbearias", value: shops },
    { label: "Ativas", value: activeShops },
    { label: "Gmail ligados", value: linkedGmail },
    { label: "Marcações", value: bookings },
    { label: "Clientes", value: customers },
    { label: "Adesões Club", value: clubMembers },
    { label: "Subscrições SaaS ativas", value: activeSubscriptions },
  ]

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[2rem] bg-[#143b2e] px-6 py-8 text-white shadow-lg sm:px-9 sm:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a6e7c8]">
          Administração central · Conta do proprietário
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          O meu FADEGO
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#d6e8df]">
          É aqui que crias e acompanhas cada barbearia. Os negócios têm o seu
          próprio painel para gerir equipa, horários, marcações e Gmail, sem
          acesso aos dados das outras barbearias.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/super-admin/barbearias#nova-barbearia"
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#173e2f] shadow-sm"
          >
            + Criar nova barbearia
          </Link>
          <Link
            href="/super-admin/barbearias"
            className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white"
          >
            Gerir barbearias
          </Link>
        </div>
      </header>

      <section aria-labelledby="how-it-works" className="rounded-2xl border border-[#dbe8dd] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="how-it-works" className="text-xl font-bold text-[#173b2b]">
            Preparar uma barbearia
          </h2>
          <p className="text-xs font-medium text-[#627a6a]">
            Do registo ao espaço próprio do negócio
          </p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#d5e9dc] bg-[#f3faf4] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#317253]">01 · Conta</p>
            <h3 className="mt-2 font-bold text-[#153b2c]">Criar o negócio</h3>
            <p className="mt-2 text-sm leading-6 text-[#536b59]">
              Indica o nome, o identificador da página e o email do proprietário.
              A conta começa suspensa até o acesso estar verificado e configurado.
            </p>
            <Link className="mt-4 inline-block text-sm font-bold text-[#18583a] underline underline-offset-4"
              href="/super-admin/barbearias#nova-barbearia">
              Abrir criação →
            </Link>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-[#f8faf7] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#567263]">02 · Endereço web</p>
            <h3 className="mt-2 font-bold text-[#153b2c]">Identificador e subdomínio</h3>
            <p className="mt-2 text-sm leading-6 text-[#536b59]">
              Hoje a página usa um endereço como /b/nome-da-barbearia.
              O subdomínio próprio automático ainda depende de configuração DNS e não está ativo.
            </p>
            <p className="mt-3 text-xs font-semibold text-amber-800">Subdomínios: pendentes</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-[#f8faf7] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#567263]">03 · Gmail</p>
            <h3 className="mt-2 font-bold text-[#153b2c]">Cada negócio liga o seu</h3>
            <p className="mt-2 text-sm leading-6 text-[#536b59]">
              O dono da barbearia entra no painel dele e escolhe
              «Ligar o Gmail do negócio com a Google». Tu acompanhas a ligação
              aqui; não precisas da palavra-passe do Gmail dos clientes.
            </p>
            <p className="mt-3 text-xs font-semibold text-amber-800">Envios reais: desativados no piloto</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="platform-numbers" className="space-y-3">
        <h2 id="platform-numbers" className="text-xl font-bold text-[#173b2b]">
          Indicadores da plataforma
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6c7b6d]">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-[#193b2d]">
                {metric.value.toLocaleString("pt-PT")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[#173b2b]">Barbearias recentes</h2>
          <Link href="/super-admin/barbearias" className="text-sm font-bold text-[#18583a] underline underline-offset-4">
            Gerir todas →
          </Link>
        </div>
        <p className="mt-2 text-sm text-[#617164]">
          O estado do Gmail é apenas informativo; ligar uma conta Google requer autorização do próprio negócio.
        </p>
        <div className="mt-4 divide-y divide-gray-100">
          {recentShops.map((shop) => (
            <article key={shop.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-bold text-[#173b2b]">{shop.name}</p>
                <p className="mt-1 break-all text-xs text-[#637468]">
                  /b/{shop.slug} · {shop.status === "ACTIVE" ? "Ativa" :
                    shop.status === "SUSPENDED" ? "Suspensa" : "Arquivada"}
                </p>
                <p className="mt-1 text-xs text-[#637468]">
                  Gmail: {shop.gmailSenderConnection ? "Ligado" : "Por ligar"} ·
                  {" "}{shop._count.bookings} marcações · {shop._count.customers} clientes
                </p>
              </div>
              <Link
                href={"/super-admin/barbearias/" + shop.id}
                className="rounded-lg border border-[#8eb9a0] px-4 py-2 text-sm font-bold text-[#205738]"
              >
                Administrar →
              </Link>
            </article>
          ))}
          {recentShops.length === 0 ? (
            <div className="py-8">
              <p className="font-semibold text-[#233b2e]">Ainda não há barbearias nesta base de dados.</p>
              <p className="mt-2 text-sm text-[#667669]">
                Começa por criar uma barbearia de teste; as contas novas permanecem suspensas.
              </p>
              <Link href="/super-admin/barbearias#nova-barbearia"
                className="mt-4 inline-block text-sm font-bold text-[#18583a] underline underline-offset-4">
                Criar a primeira barbearia →
              </Link>
            </div>
          ) : null}
        </div>
      </section>
      <p className="text-xs leading-6 text-[#627366]">
        A faturação, a cobrança online e os envios reais de Gmail continuam bloqueados nesta fase de testes.
      </p>
    </div>
  )
}
