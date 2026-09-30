import type { Metadata } from "next"
import { headers } from "next/headers"
import { lookupPrivateBooking } from "@/lib/public-booking"
import { sourceIpFromHeaders } from "@/lib/request-context"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Acesso à marcação · FADEGO",
  robots: {
    index: false,
    follow: false,
  },
}

const statusLabel = {
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED_BY_CUSTOMER: "Cancelada pelo cliente",
  CANCELLED_BY_SHOP: "Cancelada pela barbearia",
  NO_SHOW: "Não compareceu",
  NEEDS_REASSIGNMENT: "A aguardar reatribuição",
} as const

export default async function PrivateBookingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const requestHeaders = await headers()
  const result = await lookupPrivateBooking(code, {
    sourceIp: sourceIpFromHeaders(requestHeaders),
  })

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-16">
        <section className="w-full rounded-2xl border border-gray-200 bg-white p-7 text-center shadow-sm">
          <p className="text-sm font-semibold tracking-[0.18em] text-gray-500">
            FADEGO
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            Marcação indisponível
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Este acesso não está disponível. Confirma o código ou contacta a
            barbearia.
          </p>
        </section>
      </main>
    )
  }

  const booking = result.booking

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10 sm:py-16">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-[0.18em] text-gray-500">
          FADEGO
        </p>
        <h1 className="mt-3 text-3xl font-semibold">A tua marcação</h1>

        <dl className="mt-7 grid gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Serviço</dt>
            <dd className="mt-1 font-medium">{booking.serviceName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Data e hora</dt>
            <dd className="mt-1 font-medium">
              {booking.localDate} · {booking.localTime}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Duração</dt>
            <dd className="mt-1 font-medium">
              {booking.durationMinutes} minutos
            </dd>
          </div>
          {booking.professionalName ? (
            <div>
              <dt className="text-gray-500">Profissional</dt>
              <dd className="mt-1 font-medium">
                {booking.professionalName}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-gray-500">Cliente</dt>
            <dd className="mt-1 font-medium">{booking.customerName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Estado</dt>
            <dd className="mt-1 font-medium">
              {statusLabel[booking.status]}
            </dd>
          </div>
        </dl>

        <div className="mt-7 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
          Guarda este acesso para cancelar ou remarcar a tua marcação. Podes
          guardar o link ou fazer uma captura de ecrã.
        </div>

        <p className="mt-4 text-xs text-gray-500">
          O cancelamento e a remarcação serão disponibilizados numa fase
          posterior.
        </p>
      </section>
    </main>
  )
}
