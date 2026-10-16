import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, Clock3,
  Scissors, Sparkles, UsersRound,
} from "lucide-react"

const features = [
  {
    number: "01",
    Icon: CalendarDays,
    eyebrow: "Tudo no sítio",
    title: "Uma agenda que acompanha o ritmo.",
    description: "Marcações, equipa, horários e cadeiras organizados num único espaço para a tua barbearia.",
    background: "bg-[#e3eee7]",
  },
  {
    number: "02",
    Icon: Clock3,
    eyebrow: "Sem complicações",
    title: "Reservar deve ser fácil.",
    description: "Os clientes escolhem o serviço e o horário sem criar conta e sem passos desnecessários.",
    background: "bg-[#f3edde]",
  },
  {
    number: "03",
    Icon: UsersRound,
    eyebrow: "Relação duradoura",
    title: "Clientes que querem voltar.",
    description: "Organiza planos Club e acompanha a fidelização de cada barbearia com autonomia.",
    background: "bg-[#e8ede8]",
  },
]

const advantages = [
  "Reservas online sem criar conta",
  "Até cinco cadeiras por barbearia no MVP",
  "Dados separados por barbearia",
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#f8f9f4] text-[#172a21]">
      <div className="relative isolate overflow-hidden bg-[#0d2923] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70"
          style={{background: "radial-gradient(circle at 76% 37%, rgba(139,197,149,.23), transparent 40%),radial-gradient(circle at 6% 82%, rgba(164,189,139,.1), transparent 42%)"}} />
        <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-8 lg:py-7">
          <Link href="/" aria-label="FADEGO — início" className="inline-flex min-w-0 items-center gap-3">
            <Image src="/fadego-mark.svg" alt="" width={46} height={46} priority className="size-11 shrink-0 rounded-xl ring-1 ring-white/15" />
            <span>
              <span className="block text-xl font-black leading-none tracking-[-0.06em]">FADEGO</span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-[#b6d2c2]">Barbearia em movimento</span>
            </span>
          </Link>
          <nav aria-label="Navegação" className="flex shrink-0 items-center gap-5">
            <a href="#funcionalidades" className="hidden text-sm font-semibold text-[#d3e3d6] transition hover:text-white sm:inline-flex">
              Funcionalidades
            </a>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-xs font-bold transition hover:bg-white/10 sm:px-5 sm:text-sm">
              Área reservada <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        </header>

        <section className="relative mx-auto grid max-w-7xl items-center gap-11 px-5 pb-12 pt-7 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-9 lg:pb-20 lg:pt-16">
          <div className="relative z-10 max-w-[630px] lg:pb-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#c2e2b9]/25 bg-[#a5cda5]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#d2e9c8] sm:text-xs">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Mais ritmo. Menos complicação.
            </p>
            <h1 className="mt-7 text-[clamp(3.25rem,7.2vw,6.25rem)] font-black leading-[0.99] tracking-[-0.074em] text-[#f8f8ee]">
              A tua barbearia.
              <span className="mt-2 block font-serif font-normal italic tracking-[-0.055em] text-[#b8e8b8]">
                À tua maneira.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#d0e1d4] sm:text-lg">
              Uma plataforma para quem vive a barbearia todos os dias.
              Organiza a agenda, simplifica as reservas e cuida da relação com os clientes.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-full bg-[#caeabc] px-6 py-3.5 text-sm font-extrabold text-[#16372b] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#def5d5]">
                Entrar na plataforma <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <a href="#funcionalidades" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10">
                Descobrir o FADEGO
              </a>
            </div>
            <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-3 text-xs font-medium text-[#cde2d2] sm:text-sm">
              {["Mais organização", "Mais autonomia", "Mais tempo para o cliente"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 text-[#bcebbb]" />{item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[620px] min-w-0">
            <div aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-[2.6rem] border border-white/10 sm:-inset-4" />
            <div className="relative h-[410px] overflow-hidden rounded-[2rem] border border-white/15 bg-[#214238] shadow-[0_35px_100px_-35px_rgba(0,0,0,.75)] sm:h-[560px] lg:h-[645px]">
              <Image
                src="/fadego-atelier.svg"
                width={960}
                height={1120}
                priority
                alt="Ilustração de uma barbearia com cadeira clássica, espelho iluminado e instrumentos de barbeiro."
                className="h-full w-full object-cover object-center"
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#052018]/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 rounded-[1.3rem] border border-white/40 bg-[#fcfdf8]/95 p-4 text-[#213a30] shadow-[0_15px_48px_rgba(4,31,24,.3)] backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[310px] sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#557465]">Agenda · Exemplo</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3efe2] px-2.5 py-1 text-[10px] font-bold text-[#2c7155]">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#39946c]" />Organizado
                  </span>
                </div>
                {[
                  {time:"09:00", label:"Corte clássico", chair:"Cadeira 1"},
                  {time:"10:30", label:"Barba e acabamento", chair:"Cadeira 2"},
                ].map((item) => (
                  <div key={item.time} className="mt-2 flex items-center gap-3 rounded-lg border border-[#e3eae4] bg-white px-3 py-2.5">
                    <span className="text-xs font-extrabold text-[#286c55]">{item.time}</span>
                    <span aria-hidden="true" className="h-7 w-px bg-[#e3eae4]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{item.label}</span>
                      <span className="block text-[10px] text-[#76877d]">{item.chair}</span>
                    </span>
                    <Check aria-hidden="true" className="size-4 shrink-0 text-[#459573]" />
                  </div>
                ))}
                <p className="mt-3 text-[10px] text-[#7d8b7e]">Demonstração visual · Sem marcações reais</p>
              </div>
            </div>
            <span className="absolute -left-5 top-12 hidden items-center gap-2 rounded-full border border-[#d3e6d3]/30 bg-[#1d4439]/90 px-4 py-2 text-xs font-bold text-[#e3f6d8] shadow-xl backdrop-blur lg:inline-flex">
              <Scissors aria-hidden="true" className="size-4 text-[#b9e4b1]" /> Feito para barbearias
            </span>
          </div>
        </section>
        <div className="relative mx-auto max-w-7xl border-t border-white/15 px-5 py-5 sm:px-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c0d7c8] sm:justify-between sm:text-xs">
            <span>01 / Reservas sem conta</span>
            <span>02 / Gestão independente</span>
            <span>03 / Club e fidelização</span>
          </div>
        </div>
      </div>

      <section id="funcionalidades" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">O essencial, bem feito</p>
            <h2 className="mt-4 text-4xl font-black leading-[1.09] tracking-[-0.055em] text-[#172b22] sm:text-5xl">
              Tudo o que precisas.<br />
              <span className="font-serif font-normal italic text-[#5d8973]">Sem perder a identidade.</span>
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-7 text-[#62756a]">
            Tecnologia nos bastidores. A experiência da tua barbearia sempre em primeiro lugar.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:gap-5">
          {features.map((feature) => {
            const Icon = feature.Icon
            return (
              <article key={feature.number} className={"group flex min-h-[330px] flex-col rounded-[2rem] border border-[#213b2b]/5 p-7 transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-9 " + feature.background}>
                <div className="flex items-start justify-between">
                  <span className="grid size-14 place-items-center rounded-2xl border border-[#153528]/10 bg-white/60">
                    <Icon aria-hidden="true" className="size-7 text-[#2b755a]" strokeWidth={1.6} />
                  </span>
                  <span className="text-sm font-black tracking-[0.12em] text-[#6d816e]">{feature.number}</span>
                </div>
                <div className="mt-auto pt-10">
                  <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#597467]">{feature.eyebrow}</p>
                  <h3 className="max-w-[285px] text-2xl font-black leading-tight tracking-[-0.04em] text-[#172b22]">{feature.title}</h3>
                  <p className="mt-4 max-w-sm text-sm leading-7 text-[#536c5e]">{feature.description}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="border-y border-[#dfe7db] bg-[#edf4ea]">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#3f7962]">Um sistema. Várias barbearias.</p>
            <h2 className="mt-4 max-w-md text-3xl font-black tracking-[-0.05em] text-[#19332a] sm:text-4xl">Cada barbearia com o seu espaço.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#5d7265]">
              Gestão independente, com equipas, clientes e operações separados para cada barbearia.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {advantages.map((item, index) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-[#dce8d9] bg-white p-5 shadow-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e1f2dc] text-xs font-black text-[#2d7854]">{index + 1}</span>
                <span className="pt-0.5 text-sm font-semibold leading-6 text-[#2a4034]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#123b31] px-7 py-12 text-white sm:px-14 sm:py-14">
          <div aria-hidden="true" className="absolute -right-12 -top-28 size-80 rounded-full border-[54px] border-[#a5dfb0]/10" />
          <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b8e4af]">FADEGO</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.05em] sm:text-4xl">
                Mais espaço para fazeres o que fazes melhor.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#c5d9cc]">
                Plataforma em preparação para testes-piloto. Pagamentos online ainda não estão disponíveis.
              </p>
            </div>
            <Link href="/login" className="inline-flex shrink-0 items-center justify-center gap-3 self-start rounded-full bg-[#c2e7b8] px-6 py-3.5 text-sm font-extrabold text-[#153b2d] transition hover:bg-[#def5d6]">
              Aceder à área reservada <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-[#e1e8dc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-[#708075] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-extrabold tracking-[0.15em] text-[#1c4135]">FADEGO</span>
          <span>Gestão de barbearias · Versão em preparação para testes</span>
        </div>
      </footer>
    </main>
  )
}
