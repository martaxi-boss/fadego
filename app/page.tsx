import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check,
  Mail, Scissors, ShieldCheck, Sparkles,
  UsersRound,
} from "lucide-react"

const bookingSteps = [
  {
    number: "01",
    Icon: Scissors,
    title: "A barbearia prepara",
    description:
      "No seu painel, o responsável define serviços, preços, profissionais, cadeiras e horários.",
    note: "Cada negócio gere o seu próprio espaço.",
  },
  {
    number: "02",
    Icon: CalendarDays,
    title: "O cliente escolhe",
    description:
      "Na página da barbearia, escolhe o serviço, o dia e a hora. Indica o email, sem criar conta.",
    note: "Reserva simples, também no telemóvel.",
  },
  {
    number: "03",
    Icon: Mail,
    title: "A marcação fica na agenda",
    description:
      "A equipa acompanha a reserva. Com o Gmail do negócio autorizado, o cliente recebe a confirmação e o link privado para alterar ou cancelar.",
    note: "O email é enviado pelo próprio negócio.",
  },
]

const barberTools = [
  "Agenda, remarcações e cancelamentos",
  "Serviços, preços e horários",
  "Profissionais e até cinco cadeiras",
  "Clientes e planos Club",
]

const customerJourney = [
  "Escolher serviço, profissional e horário disponível.",
  "Indicar nome, telefone e email para a reserva.",
  "Consultar, alterar ou cancelar através do link privado recebido por email.",
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#f8f9f4] text-[#172a21]">
      <div className="relative isolate overflow-hidden bg-[#0d2923] text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 76% 37%, rgba(139,197,149,.23), transparent 40%),radial-gradient(circle at 6% 82%, rgba(164,189,139,.1), transparent 42%)",
          }}
        />
        <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-8 lg:py-7">
          <Link
            href="/"
            aria-label="FADEGO — início"
            className="inline-flex min-w-0 items-center gap-3"
          >
            <Image
              src="/fadego-mark.webp"
              alt=""
              width={46}
              height={46}
              priority
              className="size-11 shrink-0 rounded-xl ring-1 ring-white/15"
            />
            <span>
              <span className="block text-xl font-black leading-none tracking-[-0.06em]">
                FADEGO
              </span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-[#b6d2c2]">
                Barbearias em movimento
              </span>
            </span>
          </Link>
          <nav aria-label="Navegação" className="flex shrink-0 items-center gap-2 sm:gap-5">
            <a
              href="#como-funciona"
              className="hidden text-sm font-semibold text-[#d3e3d6] transition hover:text-white lg:inline-flex"
            >
              Como funciona
            </a>
            <Link
              href="/login"
              className="hidden text-sm font-semibold text-[#d3e3d6] transition hover:text-white sm:inline-flex"
            >
              Área reservada
            </Link>
            <a
              href="/experimentar"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#c9e8be] px-3.5 py-2.5 text-xs font-extrabold text-[#143a2a] transition hover:bg-[#e1f6d9] sm:gap-2 sm:px-5 sm:text-sm"
            >
              Experimentar <ArrowUpRight aria-hidden="true" className="size-3.5 sm:size-4" />
            </a>
          </nav>
        </header>

        <section className="relative mx-auto grid max-w-7xl items-center gap-11 px-5 pb-12 pt-7 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-9 lg:pb-20 lg:pt-16">
          <div className="relative z-10 max-w-[630px] lg:pb-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#c2e2b9]/25 bg-[#a5cda5]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d2e9c8] sm:text-xs">
              <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
              Para quem vive a barbearia todos os dias
            </p>
            <h1 className="mt-7 text-[clamp(2.85rem,7.2vw,6.25rem)] font-black leading-[0.99] tracking-[-0.074em] text-[#f8f8ee]">
              Menos confusão.
              <span className="mt-2 block font-serif font-normal italic tracking-[-0.055em] text-[#b8e8b8]">
                Mais barbearia.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#d0e1d4] sm:text-lg">
              O cliente marca online sem criar conta. Tu organizas os horários,
              as cadeiras, a equipa e as reservas num painel só.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="/experimentar"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#caeabc] px-6 py-3.5 text-sm font-extrabold text-[#16372b] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#def5d5]"
              >
                Experimentar sem login <ArrowRight aria-hidden="true" className="size-4" />
              </a>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 max-w-lg text-xs leading-5 text-[#b4cbbb]">
              A demonstração utiliza dados fictícios e não faz reservas ou envios reais.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-[#cde2d2] sm:text-sm">
              {["Sem conta para o cliente", "Agenda organizada", "Dados separados por barbearia"].map(
                (item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 shrink-0 text-[#bcebbb]" />
                    {item}
                  </span>
                ),
              )}
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
              <div className="absolute bottom-4 left-4 right-4 rounded-[1.3rem] border border-white/40 bg-[#fcfdf8]/95 p-4 text-[#213a30] shadow-[0_15px_48px_-15px_rgba(4,31,24,.3)] backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[320px] sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#557465]">
                    Agenda · Exemplo
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3efe2] px-2.5 py-1 text-[10px] font-bold text-[#2c7155]">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#39946c]" />
                    Organizado
                  </span>
                </div>
                {[
                  { time: "09:00", label: "Corte clássico", chair: "Cadeira 1" },
                  { time: "10:30", label: "Barba e acabamento", chair: "Cadeira 2" },
                ].map((item) => (
                  <div
                    key={item.time}
                    className="mt-2 flex items-center gap-3 rounded-lg border border-[#e3eae4] bg-white px-3 py-2.5"
                  >
                    <span className="text-xs font-extrabold text-[#286c55]">{item.time}</span>
                    <span aria-hidden="true" className="h-7 w-px bg-[#e3eae4]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{item.label}</span>
                      <span className="block text-[10px] text-[#76877d]">{item.chair}</span>
                    </span>
                    <Check aria-hidden="true" className="size-4 shrink-0 text-[#459573]" />
                  </div>
                ))}
                <p className="mt-3 text-[10px] text-[#7d8b7e]">
                  Demonstração visual · Sem marcações reais
                </p>
              </div>
            </div>
            <span className="absolute -left-5 top-12 hidden items-center gap-2 rounded-full border border-[#d3e6d3]/30 bg-[#1d4439]/90 px-4 py-2 text-xs font-bold text-[#e3f6d8] shadow-xl backdrop-blur lg:inline-flex">
              <Scissors aria-hidden="true" className="size-4 text-[#b9e4b1]" />
              Feito para barbearias
            </span>
          </div>
        </section>
        <div className="relative mx-auto max-w-7xl border-t border-white/15 px-5 py-5 sm:px-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c0d7c8] sm:justify-between sm:text-xs">
            <span>01 / A barbearia configura</span>
            <span>02 / O cliente reserva</span>
            <span>03 / A agenda acompanha</span>
          </div>
        </div>
      </div>

      <section
        id="como-funciona"
        aria-labelledby="como-funciona-titulo"
        className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">
            Simples de perceber
          </p>
          <h2
            id="como-funciona-titulo"
            className="mt-4 text-3xl font-black leading-[1.1] tracking-[-0.055em] text-[#172b22] sm:text-5xl"
          >
            Como funciona <span className="font-serif font-normal italic text-[#5d8973]">na prática?</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#617669] sm:text-base">
            Três passos. O cliente reserva, a barbearia organiza e cada um sabe o que tem a fazer.
          </p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {bookingSteps.map((step) => {
            const Icon = step.Icon
            return (
              <article
                key={step.number}
                className="flex min-h-[285px] flex-col rounded-[1.7rem] border border-[#dfe9dd] bg-white p-6 shadow-[0_12px_35px_-25px_rgba(15,50,31,.22)] sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#e3f1e3]">
                    <Icon aria-hidden="true" className="size-6 text-[#276d51]" strokeWidth={1.7} />
                  </span>
                  <span className="text-sm font-black tracking-[0.15em] text-[#8ca497]">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-7 text-xl font-black tracking-[-0.035em] text-[#1b352a]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#5b7164]">{step.description}</p>
                <p className="mt-auto border-t border-[#e5ece5] pt-5 text-xs font-bold text-[#317251]">
                  {step.note}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <section
        id="funcionalidades"
        aria-labelledby="funcionalidades-titulo"
        className="border-y border-[#dfe7db] bg-[#eaf1e8]"
      >
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">
              Dois lados. Um sistema.
            </p>
            <h2
              id="funcionalidades-titulo"
              className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#172b22] sm:text-5xl"
            >
              Fácil para o cliente. <span className="font-serif font-normal italic text-[#5d8973]">Completo para a barbearia.</span>
            </h2>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-2">
            <article className="rounded-[2rem] bg-[#153a2f] p-7 text-white shadow-[0_18px_45px_-35px_rgba(3,30,17,.45)] sm:p-9">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-white/10">
                  <Scissors aria-hidden="true" className="size-6 text-[#bcebb8]" />
                </span>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#bbdcc7]">
                  Para o dono da barbearia
                </p>
              </div>
              <h3 className="mt-6 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                O negócio no teu painel.
              </h3>
              <p className="mt-3 max-w-md text-sm leading-7 text-[#cfdfd2]">
                Vês a agenda e organizas o trabalho do dia. A tua equipa tem permissões próprias; os dados de outros negócios não entram aqui.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {barberTools.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#ebf7ed]">
                    <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-[#bee6b4]" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[2rem] border border-[#e1e9da] bg-[#fdfbf3] p-7 shadow-[0_18px_45px_-35px_rgba(3,30,17,.2)] sm:p-9">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#e5eddc]">
                  <UsersRound aria-hidden="true" className="size-6 text-[#317258]" />
                </span>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#57806b]">
                  Para quem vai cortar o cabelo
                </p>
              </div>
              <h3 className="mt-6 text-2xl font-black tracking-[-0.04em] text-[#1b3529] sm:text-3xl">
                Reservar sem criar conta.
              </h3>
              <p className="mt-3 max-w-md text-sm leading-7 text-[#617669]">
                A pessoa entra na página da sua barbearia, escolhe o horário e fica com acesso privado à reserva.
              </p>
              <ol className="mt-6 grid gap-3">
                {customerJourney.map((item, index) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#315143]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#dfeddd] text-xs font-black text-[#2d7151]">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-xl bg-[#eff3e9] px-4 py-3 text-xs leading-6 text-[#597361]">
                As confirmações e os links são enviados quando o Gmail do próprio negócio estiver ligado e autorizado.
              </p>
            </article>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d6e3d4] bg-white/70 px-5 py-4 text-sm leading-6 text-[#385444]">
            <ShieldCheck aria-hidden="true" className="size-6 shrink-0 text-[#327657]" />
            <p>
              <strong>Um FADEGO, várias barbearias.</strong> Cada uma tem o seu painel, a sua equipa e os seus clientes. A administração da plataforma fica separada.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#123b31] px-7 py-10 text-white sm:px-14 sm:py-14">
          <div aria-hidden="true" className="absolute -right-12 -top-28 size-80 rounded-full border-[54px] border-[#a5dfb0]/10" />
          <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-center">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b8e4af]">Conhece o FADEGO</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.05em] sm:text-4xl">
                Vê como funciona. Sem passwords.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#d1e3d7]">
                Experimenta o site, o painel da barbearia, a administração da plataforma e uma reserva de exemplo.
              </p>
              <p className="mt-3 text-xs leading-6 text-[#b8cdbd]">
                Demonstração interativa com dados fictícios. O FADEGO está em fase piloto.
                Pagamentos online ainda não estão disponíveis.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a
                href="/experimentar"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#c2e7b8] px-6 py-3.5 text-sm font-extrabold text-[#153b2d] transition hover:bg-[#def5d6]"
              >
                Ver demonstração <ArrowRight aria-hidden="true" className="size-4" />
              </a>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Área reservada <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e1e8dc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-[#708075] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-extrabold tracking-[0.15em] text-[#1c4135]">FADEGO</span>
          <span>Barbearias em movimento · Versão em preparação para testes</span>
        </div>
      </footer>
    </main>
  )
}
