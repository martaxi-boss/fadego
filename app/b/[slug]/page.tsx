import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Check, Scissors } from "lucide-react"
import PublicBookingFlow from "@/app/b/[slug]/public-booking-flow"
import { getPublicCatalog } from "@/lib/public-booking"

export const dynamic = "force-dynamic"
export const revalidate = 0

const ExternalLink = ({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) => (
  <a
    className="underline decoration-[#c6dfc8]/60 underline-offset-4 hover:decoration-white"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
  </a>
)

export default async function PublicBarbershopPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const catalog = await getPublicCatalog(slug)

  if (!catalog) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8f3] px-5 py-16">
        <section className="w-full max-w-xl rounded-[2rem] border border-[#e0e9e0] bg-white p-8 text-center shadow-sm">
          <Image src="/fadego-mark.svg" alt="" width={52} height={52} className="mx-auto size-13 rounded-xl" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#51846d]">FADEGO</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[#19382d]">Reservas indisponíveis</h1>
          <p className="mt-2 text-sm leading-6 text-[#63796b]">
            Esta página não está disponível para reservas online.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f6f8f3] px-4 pb-16 pt-5 text-[#1b3229] sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-5 flex items-center justify-between gap-4" aria-label="Marca da plataforma">
          <Link href="/" aria-label="FADEGO — página inicial" className="inline-flex items-center gap-2.5">
            <Image src="/fadego-mark.svg" alt="" width={34} height={34} className="size-9 rounded-lg" />
            <span className="text-base font-black tracking-[-0.06em] text-[#174333]">FADEGO</span>
          </Link>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#668171]">
            <Check aria-hidden="true" className="size-3.5" /> Reserva sem criar conta
          </span>
        </nav>
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-[#123a30] px-6 py-8 text-white shadow-[0_28px_55px_-39px_rgba(6,42,29,.6)] sm:px-8 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 size-72 rounded-full border-[44px] border-[#9bcd9d]/10" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0"
            style={{background:"radial-gradient(circle at 90% 10%,rgba(171,212,147,.12),transparent 50%)"}} />
          <div className="relative">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#c8e4ca]">
              <CalendarDays className="size-3.5" aria-hidden="true" /> Marcação online
            </div>
            <div className="flex flex-wrap items-start gap-4 sm:gap-5">
              {catalog.logoUrl ? (
                <img
                  alt=""
                  className="size-17 shrink-0 rounded-2xl border border-white/30 bg-white object-cover shadow-md"
                  height={68}
                  src={catalog.logoUrl}
                  width={68}
                />
              ) : (
                <div aria-hidden="true" className="grid size-17 shrink-0 place-items-center rounded-2xl border border-white/15 bg-[#dcefd6] text-3xl font-black text-[#2a6a4f]">
                  {catalog.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a6d4b2]">A tua próxima visita</p>
                <h1 className="mt-1 break-words text-3xl font-black leading-tight tracking-[-0.05em] sm:text-4xl">
                  {catalog.name}
                </h1>
              </div>
            </div>
            <div className="mt-6 grid gap-2 border-t border-white/15 pt-5 text-sm leading-6 text-[#dceadf]">
              {catalog.address ? <p>{catalog.address}</p> : null}
              {catalog.phone ? <p>{catalog.phone}</p> : null}
              {catalog.instagramLabel ? (
                <p>Instagram: {catalog.instagramUrl ? (
                  <ExternalLink href={catalog.instagramUrl}>{catalog.instagramLabel}</ExternalLink>
                ) : catalog.instagramLabel}</p>
              ) : null}
              {catalog.officialWebsiteLabel ? (
                <p>Site: {catalog.officialWebsiteUrl ? (
                  <ExternalLink href={catalog.officialWebsiteUrl}>{catalog.officialWebsiteLabel}</ExternalLink>
                ) : catalog.officialWebsiteLabel}</p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-5" aria-label="Escolher serviço, dia e hora">
          <PublicBookingFlow
            generalAvailable={catalog.generalAvailable}
            professionals={catalog.professionals}
            services={catalog.services}
            slug={catalog.slug}
          />
        </section>
        <footer className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-[#718577]">
          <Scissors aria-hidden="true" className="size-3.5" /> Marcações disponibilizadas através do FADEGO
        </footer>
      </div>
    </main>
  )
}
