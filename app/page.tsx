import Image from "next/image"
import {
  CalendarDays,
  Check,
  Clock3,
  LockKeyhole,
  Mail,
  Scissors,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

const process = [
  {
    number: "01",
    Icon: Scissors,
    title: "A barbearia organiza",
    description:
      "O responsável define os serviços, os preços, os profissionais, as cadeiras e o horário geral do negócio.",
    detail: "Cada barbearia tem o seu espaço de gestão.",
  },
  {
    number: "02",
    Icon: CalendarDays,
    title: "O cliente marca",
    description:
      "Na página da barbearia, escolhe um serviço, o dia e uma hora disponível. Não precisa de criar uma conta FADEGO.",
    detail: "Sem marcações duplicadas para a mesma disponibilidade.",
  },
  {
    number: "03",
    Icon: Mail,
    title: "Todos acompanham",
    description:
      "A marcação fica na agenda. Com o Gmail do negócio ligado, o cliente recebe um email e um link privado para consultar, alterar ou cancelar.",
    detail: "O email é da barbearia, não da plataforma.",
  },
]

const shopCapabilities = [
  { Icon: CalendarDays, title: "Agenda e reservas", text: "Consultar horários, gerir reservas e acompanhar alterações." },
  { Icon: Clock3, title: "Serviços e horários", text: "Definir serviços, preços, duração e horário semanal do negócio." },
  { Icon: Scissors, title: "Equipa e cadeiras", text: "Organizar profissionais e até cinco cadeiras por barbearia nesta primeira versão." },
  { Icon: UsersRound, title: "Clientes e Club", text: "Consultar clientes e criar planos de fidelização, com controlo das utilizações." },
]

const spaces = [
  {
    title: "Website FADEGO",
    audience: "Para qualquer visitante",
    description:
      "Explica o serviço, a organização das reservas e os benefícios para as barbearias. É uma página informativa, não uma agenda de marcações.",
  },
  {
    title: "Portal da plataforma",
    audience: "Para quem administra o FADEGO",
    description:
      "Área privada de gestão central, separada dos negócios. A criação e gestão autónoma de contas das barbearias faz parte da próxima fase do portal.",
  },
  {
    title: "Painel de cada barbearia",
    audience: "Para proprietários e equipa autorizada",
    description:
      "Cada negócio gere os seus serviços, equipa, agenda e clientes num espaço próprio. Os dados não se misturam com os de outras barbearias.",
  },
  {
    title: "Página de reservas",
    audience: "Para o cliente da barbearia",
    description:
      "Página própria do estabelecimento, fora deste website institucional. Permite escolher e gerir uma marcação sem registo de conta.",
  },
]

const future = [
  "Gestão central de contas e adesão das barbearias a partir do portal do FADEGO.",
  "Disponibilidades individuais, folgas e férias de cada profissional.",
  "Pagamentos e subscrições online, após integração e validação.",
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
          <a href="/" aria-label="FADEGO — página inicial" className="inline-flex min-w-0 items-center gap-3">
            <Image
              src="/fadego-mark.webp"
              alt=""
              width={46}
              height={46}
              priority
              unoptimized
              className="size-11 shrink-0 rounded-xl ring-1 ring-white/15"
            />
            <span>
              <span className="block text-xl font-black leading-none tracking-[-0.06em]">FADEGO</span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-[#b6d2c2]">
                Barbearias em movimento
              </span>
            </span>
          </a>
          <nav aria-label="Navegação institucional" className="flex shrink-0 items-center gap-3 sm:gap-5">
            <a
              href="#como-funciona"
              className="hidden text-sm font-semibold text-[#d3e3d6] transition hover:text-white lg:inline-flex"
            >
              Como funciona
            </a>
            <a
              href="#funcionalidades"
              className="hidden text-sm font-semibold text-[#d3e3d6] transition hover:text-white lg:inline-flex"
            >
              A plataforma
            </a>
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2.5 text-xs font-bold text-[#e2f1e5] transition hover:bg-white/10 sm:px-5 sm:text-sm"
            >
              <LockKeyhole aria-hidden="true" className="size-3.5" />
              Portal FADEGO
            </a>
          </nav>
        </header>

        <section className="relative mx-auto grid max-w-7xl items-center gap-11 px-5 pb-12 pt-7 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-9 lg:pb-20 lg:pt-16">
          <div className="relative z-10 max-w-[630px] lg:pb-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#c2e2b9]/25 bg-[#a5cda5]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#d2e9c8] sm:text-xs">
              Plataforma de gestão de barbearias
            </p>
            <h1 className="mt-7 text-[clamp(2.8rem,7.2vw,6.25rem)] font-black leading-[0.99] tracking-[-0.074em] text-[#f8f8ee]">
              Uma agenda clara.
              <span className="mt-2 block font-serif font-normal italic tracking-[-0.055em] text-[#b8e8b8]">
                Uma barbearia organizada.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#d0e1d4] sm:text-lg">
              O FADEGO liga as reservas online à gestão diária de cada barbearia:
              o cliente escolhe a hora, a equipa acompanha a agenda e o proprietário
              organiza o negócio num só painel.
            </p>
            <div className="mt-9 grid gap-3 text-sm text-[#d9e9dd]">
              {[
                "O cliente marca sem precisar de uma conta.",
                "Cada barbearia gere o seu próprio espaço.",
                "Os horários e as reservas ficam organizados.",
              ].map((item) => (
                <p key={item} className="flex items-start gap-2.5">
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-[#bcebbb]" />
                  {item}
                </p>
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
                unoptimized
                alt="Ilustração de uma barbearia com cadeira clássica, espelho iluminado e instrumentos de barbeiro."
                className="h-full w-full object-cover object-center"
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#052018]/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 rounded-[1.3rem] border border-white/40 bg-[#fcfdf8]/95 p-4 text-[#213a30] shadow-[0_15px_48px_-15px_rgba(4,31,24,.3)] backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[310px] sm:p-5">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#557465]">
                  Como pode ficar um dia na agenda
                </p>
                {[
                  { time: "09:00", label: "Corte clássico", chair: "Cadeira 1" },
                  { time: "10:30", label: "Barba e acabamento", chair: "Cadeira 2" },
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
                <p className="mt-3 text-[10px] text-[#7d8b7e]">
                  Exemplo ilustrativo · Sem marcações reais
                </p>
              </div>
            </div>
          </div>
        </section>
        <div className="relative mx-auto max-w-7xl border-t border-white/15 px-5 py-5 sm:px-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c0d7c8] sm:justify-between sm:text-xs">
            <span>01 / Horários definidos</span>
            <span>02 / Reservas online</span>
            <span>03 / Gestão no portal</span>
          </div>
        </div>
      </div>

      <section id="como-funciona" aria-labelledby="como-titulo" className="mx-auto max-w-7xl scroll-mt-10 px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">O percurso de uma marcação</p>
          <h2 id="como-titulo" className="mt-4 text-3xl font-black leading-tight tracking-[-0.05em] text-[#172b22] sm:text-5xl">
            Como funciona <span className="font-serif font-normal italic text-[#5d8973]">o FADEGO?</span>
          </h2>
          <p className="mt-4 text-base leading-8 text-[#65796c]">
            A ideia é simples: a barbearia organiza a disponibilidade, o cliente escolhe uma hora e a agenda mantém tudo no mesmo sítio.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {process.map((step) => {
            const Icon = step.Icon
            return (
              <article key={step.number} className="flex min-h-[310px] flex-col rounded-[1.8rem] border border-[#e1e9de] bg-white p-7 shadow-[0_15px_40px_-30px_rgba(12,54,32,.2)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#e2f0e4]">
                    <Icon aria-hidden="true" className="size-6 text-[#2a7455]" />
                  </span>
                  <span className="text-sm font-extrabold tracking-[0.16em] text-[#779887]">{step.number}</span>
                </div>
                <h3 className="mt-7 text-xl font-black tracking-[-0.035em] text-[#1d352a]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#5c7465]">{step.description}</p>
                <p className="mt-auto border-t border-[#e5ede5] pt-4 text-xs font-semibold leading-6 text-[#347456]">{step.detail}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section id="funcionalidades" aria-labelledby="funcoes-titulo" className="border-y border-[#dfe7db] bg-[#eaf1e8]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">Dia a dia do negócio</p>
            <h2 id="funcoes-titulo" className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#172b22] sm:text-5xl">
              O que a barbearia consegue gerir?
            </h2>
            <p className="mt-4 text-base leading-8 text-[#65796c]">
              As principais ferramentas ficam reunidas no painel da própria barbearia, sem misturar clientes ou operações de outros estabelecimentos.
            </p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2">
            {shopCapabilities.map((item) => {
              const Icon = item.Icon
              return (
                <article key={item.title} className="flex items-start gap-4 rounded-[1.6rem] border border-[#dbe8db] bg-white p-6 sm:p-7">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e3f1e3]">
                    <Icon aria-hidden="true" className="size-6 text-[#2c7657]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-[-0.035em]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#65786b]">{item.text}</p>
                  </div>
                </article>
              )
            })}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#d2e2d1] bg-white px-5 py-4 text-sm leading-7 text-[#365947]">
            <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-[#327657]" />
            <p><strong>Dados separados por barbearia.</strong> Cada negócio tem a sua agenda, equipa e clientes. O dono administra o seu estabelecimento, não os restantes.</p>
          </div>
        </div>
      </section>

      <section id="estrutura" aria-labelledby="estrutura-titulo" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">Website e áreas de trabalho</p>
          <h2 id="estrutura-titulo" className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#172b22] sm:text-5xl">
            Cada pessoa entra no espaço certo.
          </h2>
          <p className="mt-4 text-base leading-8 text-[#65796c]">
            Este website explica a plataforma. A administração e as marcações pertencem a áreas distintas, com acessos e funções diferentes.
          </p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {spaces.map((space) => (
            <article key={space.title} className="rounded-[1.5rem] border border-[#dde7df] bg-white p-6 sm:p-7">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#438060]">{space.audience}</p>
              <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-[#173629]">{space.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#627567]">{space.description}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 rounded-[1.5rem] border border-[#d9e6d8] bg-[#f0f5eb] px-6 py-5 text-sm leading-7 text-[#3e614b]">
          <strong>O Gmail pertence à barbearia.</strong> Cada negócio liga a sua própria conta Google para enviar confirmações e links privados. Os clientes apenas indicam o email para receber a informação; não precisam de ligar o Gmail ao FADEGO.
        </div>
      </section>

      <section aria-labelledby="evolucao-titulo" className="border-y border-[#e1e9de] bg-[#f1f4ed]">
        <div className="mx-auto max-w-7xl grid gap-9 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#377f60]">FADEGO em evolução</p>
            <h2 id="evolucao-titulo" className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#172b22] sm:text-4xl">
              Construído por etapas, para funcionar bem.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#667a6b]">
              O sistema de gestão e o motor de reservas estão implementados em fase de testes. Algumas funções de operação e comercialização ainda estão em preparação.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-[#dce8d9] bg-white p-6 sm:p-8">
            <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.15em] text-[#397c59]">Próximas funcionalidades</p>
            <ul className="grid gap-4">
              {future.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-7 text-[#3f5b49]">
                  <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[#74a985]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-[#e2eae0] pt-4 text-xs leading-6 text-[#7a8a7b]">
              Pagamentos online ainda não estão disponíveis. O envio real de emails requer a ligação e autorização do Gmail do negócio.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e1e8dc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-[#708075] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-extrabold tracking-[0.15em] text-[#1c4135]">FADEGO</span>
          <span>Website informativo · Gestão de barbearias · Fase piloto</span>
        </div>
      </footer>
    </main>
  )
}
