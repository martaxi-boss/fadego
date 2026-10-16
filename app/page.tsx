import Link from "next/link"

const features = [
  {
    index: "01",
    title: "Agenda organizada",
    description: "Marcações, equipas e cadeiras ligadas num único calendário operacional.",
  },
  {
    index: "02",
    title: "Reservas simplificadas",
    description: "Os clientes escolhem o serviço e o horário sem criar uma conta.",
  },
  {
    index: "03",
    title: "Club e fidelização",
    description: "Planos, adesões e utilização de serviços com controlo independente por barbearia.",
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-12 size-96 rounded-full bg-teal-400/10 blur-3xl" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-5 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-xl font-black tracking-tight">
            <span className="grid size-10 place-items-center rounded-xl bg-teal-300 text-lg text-slate-950">F</span>
            FADEGO
          </Link>
          <Link href="/login" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10">
            Entrar na plataforma →
          </Link>
        </header>
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-300">A barbearia. Mais autónoma.</p>
            <h1 className="mt-6 max-w-2xl text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Menos confusão.<br />
              <span className="text-teal-300">Mais tempo para criar.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Centraliza reservas, equipa, horários e fidelização.
              Dá aos clientes uma marcação fácil e mantém o controlo do teu negócio.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="rounded-xl bg-teal-300 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-teal-200" href="/login">
                Acesso de administração
              </Link>
              <a href="#funcionalidades" className="rounded-xl border border-white/25 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/10">
                Conhecer funcionalidades
              </a>
            </div>
          </div>
          <div aria-hidden="true" className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-lg">
            <div className="rounded-2xl bg-white p-6 text-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Agenda · Demonstração visual</span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Organizado</span>
              </div>
              <h2 className="mt-4 text-2xl font-bold">O teu dia, sem complicações.</h2>
              <div className="mt-7 space-y-3">
                {[
                  { time: "09:00", label: "Corte clássico", person: "Cadeira 1" },
                  { time: "10:30", label: "Barba e acabamento", person: "Cadeira 2" },
                  { time: "11:15", label: "Corte + barba", person: "Cadeira 3" },
                ].map((item) => (
                  <div key={item.time} className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                    <span className="text-sm font-black text-teal-700">{item.time}</span>
                    <div>
                      <p className="font-semibold">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.person}</p>
                    </div>
                    <span className="ml-auto size-2 rounded-full bg-teal-500" />
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-slate-400">Ilustração da interface — não são reservas reais.</p>
            </div>
          </div>
        </section>
      </div>
      <section id="funcionalidades" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Pensado para o teu dia a dia</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tudo mais simples, num só lugar.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.index} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <span className="text-xs font-black tracking-[0.16em] text-teal-700">{feature.index} / FADEGO</span>
              <h3 className="mt-5 text-xl font-bold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-slate-500">
          Plataforma em preparação para testes-piloto. Pagamentos online ainda não disponíveis.
        </p>
      </section>
    </main>
  )
}
