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
    className="underline decoration-gray-300 underline-offset-4 hover:decoration-gray-950"
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
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-16">
        <section className="w-full rounded-2xl border border-gray-200 bg-white p-7 text-center shadow-sm">
          <p className="text-sm font-semibold tracking-[0.18em] text-gray-500">
            FADEGO
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            Reservas indisponíveis
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Esta página não está disponível para reservas online.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          {catalog.logoUrl ? (
            <img
              alt=""
              className="h-16 w-16 rounded-2xl border border-gray-200 object-cover"
              height={64}
              src={catalog.logoUrl}
              width={64}
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-950 text-xl font-semibold text-white"
            >
              {catalog.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              FADEGO
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {catalog.name}
            </h1>
          </div>
        </div>

        <div className="mt-5 grid gap-2 text-sm leading-6 text-gray-600">
          {catalog.address ? <p>{catalog.address}</p> : null}
          {catalog.phone ? <p>{catalog.phone}</p> : null}
          {catalog.instagramLabel ? (
            <p>
              Instagram:{" "}
              {catalog.instagramUrl ? (
                <ExternalLink href={catalog.instagramUrl}>
                  {catalog.instagramLabel}
                </ExternalLink>
              ) : (
                catalog.instagramLabel
              )}
            </p>
          ) : null}
          {catalog.officialWebsiteLabel ? (
            <p>
              Site:{" "}
              {catalog.officialWebsiteUrl ? (
                <ExternalLink href={catalog.officialWebsiteUrl}>
                  {catalog.officialWebsiteLabel}
                </ExternalLink>
              ) : (
                catalog.officialWebsiteLabel
              )}
            </p>
          ) : null}
        </div>
      </header>

      <section className="mt-6">
        <PublicBookingFlow
          generalAvailable={catalog.generalAvailable}
          professionals={catalog.professionals}
          services={catalog.services}
          slug={catalog.slug}
        />
      </section>
    </main>
  )
}
