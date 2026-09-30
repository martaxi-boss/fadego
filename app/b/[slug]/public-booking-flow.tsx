"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

type ServiceOption = {
  id: string
  name: string
  description: string | null
  price: string
  durationMinutes: number
}

type ProfessionalOption = {
  id: string
  name: string
  photoUrl: string | null
}

type Slot = {
  startsAt: string
  endsAt: string
  localTime: string
  availableCapacity: number
}

type AvailabilityResponse =
  | {
      ok: true
      availability: {
        localDate: string
        timezone: string
        mode: "GENERAL_BOOKING" | "STAFF_BOOKING"
        serviceDurationMinutes: number
        slots: Slot[]
      }
    }
  | {
      ok: false
      code: "INVALID_INPUT" | "UNAVAILABLE"
    }

type BookingResponse =
  | {
      ok: true
      accessCode: string
      accessPath: string
    }
  | {
      ok: false
      code:
        | "INVALID_INPUT"
        | "TENANT_UNAVAILABLE"
        | "SERVICE_UNAVAILABLE"
        | "STAFF_UNAVAILABLE"
        | "SLOT_UNAVAILABLE"
        | "RATE_LIMITED"
        | "UNAVAILABLE"
    }

const GENERAL_METHOD = "GENERAL"

const priceLabel = (value: string) => {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
      }).format(amount)
    : value
}

export default function PublicBookingFlow({
  slug,
  services,
  professionals,
  generalAvailable,
}: {
  slug: string
  services: ServiceOption[]
  professionals: ProfessionalOption[]
  generalAvailable: boolean
}) {
  const router = useRouter()
  const firstMethod = generalAvailable
    ? GENERAL_METHOD
    : (professionals[0]?.id ?? "")
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "")
  const [method, setMethod] = useState(firstMethod)
  const [localDate, setLocalDate] = useState("")
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedStart, setSelectedStart] = useState("")
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false)
  const [availabilityPending, setAvailabilityPending] = useState(false)
  const [bookingPending, setBookingPending] = useState(false)
  const [successPendingRedirect, setSuccessPendingRedirect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetSlots = () => {
    setSlots([])
    setSelectedStart("")
    setAvailabilityLoaded(false)
    setError(null)
  }

  const loadAvailability = async () => {
    setError(null)
    setSelectedStart("")
    setAvailabilityLoaded(false)

    if (!serviceId || !method || !localDate) {
      setError("Escolhe serviço, atendimento e dia antes de ver os horários.")
      return
    }

    setAvailabilityPending(true)

    try {
      const response = await fetch(
        `/api/public/barbershops/${encodeURIComponent(slug)}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            serviceId,
            localDate,
            requestedStaffMemberId:
              method === GENERAL_METHOD ? undefined : method,
          }),
        },
      )

      const payload = (await response.json()) as AvailabilityResponse
      if (!payload.ok) {
        setSlots([])
        setError("Não foi possível consultar horários para esta seleção.")
        return
      }

      setSlots(payload.availability.slots)
      setAvailabilityLoaded(true)
    } catch {
      setSlots([])
      setError("Não foi possível consultar horários neste momento.")
    } finally {
      setAvailabilityPending(false)
    }
  }

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!selectedStart) {
      setError("Escolhe um horário disponível.")
      return
    }

    const form = new FormData(event.currentTarget)
    setBookingPending(true)

    try {
      const response = await fetch(
        `/api/public/barbershops/${encodeURIComponent(slug)}/bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            serviceId,
            requestedStaffMemberId:
              method === GENERAL_METHOD ? undefined : method,
            startsAt: selectedStart,
            customer: {
              name: String(form.get("name") ?? ""),
              phone: String(form.get("phone") ?? ""),
              email: String(form.get("email") ?? ""),
            },
          }),
        },
      )

      const payload = (await response.json()) as BookingResponse

      if (!payload.ok) {
        if (payload.code === "SLOT_UNAVAILABLE") {
          await loadAvailability()
          setError(
            "Esse horário acabou de ficar indisponível. Escolhe outro horário.",
          )
          return
        }

        if (payload.code === "RATE_LIMITED") {
          setError(
            "Foram feitas demasiadas tentativas. Tenta novamente dentro de alguns minutos.",
          )
          return
        }

        if (payload.code === "STAFF_UNAVAILABLE") {
          setError(
            "Esse profissional deixou de estar disponível. Escolhe novamente.",
          )
          return
        }

        setError(
          "Não foi possível confirmar a marcação. Revê os dados e tenta novamente.",
        )
        return
      }

      setSuccessPendingRedirect(true)
      router.push(payload.accessPath)
    } catch {
      setError("Não foi possível confirmar a marcação neste momento.")
    } finally {
      setBookingPending(false)
    }
  }

  if (services.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-6">
        <h2 className="text-xl font-semibold">Sem serviços disponíveis</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Esta barbearia ainda não tem serviços ativos para reserva online.
        </p>
      </section>
    )
  }

  if (!generalAvailable && professionals.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-6">
        <h2 className="text-xl font-semibold">Reservas online indisponíveis</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Não existem métodos de atendimento reserváveis neste momento.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Marcação
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Escolhe o teu horário</h2>
      </div>

      <div className="mt-6 grid gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">1. Serviço</legend>
          <div className="grid gap-3">
            {services.map((service) => {
              const selected = serviceId === service.id
              return (
                <button
                  aria-pressed={selected}
                  className={
                    selected
                      ? "rounded-xl border border-gray-950 bg-gray-950 p-4 text-left text-white"
                      : "rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-gray-500"
                  }
                  key={service.id}
                  onClick={() => {
                    setServiceId(service.id)
                    resetSlots()
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-semibold">{service.name}</span>
                    <span className="shrink-0 text-sm font-semibold">
                      {priceLabel(service.price)}
                    </span>
                  </div>
                  <p
                    className={
                      selected
                        ? "mt-1 text-sm text-gray-300"
                        : "mt-1 text-sm text-gray-500"
                    }
                  >
                    {service.durationMinutes} minutos
                  </p>
                  {service.description ? (
                    <p
                      className={
                        selected
                          ? "mt-2 text-sm leading-6 text-gray-200"
                          : "mt-2 text-sm leading-6 text-gray-600"
                      }
                    >
                      {service.description}
                    </p>
                  ) : null}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">2. Atendimento</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {generalAvailable ? (
              <button
                aria-pressed={method === GENERAL_METHOD}
                className={
                  method === GENERAL_METHOD
                    ? "rounded-xl border border-gray-950 bg-gray-950 p-4 text-left text-white"
                    : "rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-gray-500"
                }
                onClick={() => {
                  setMethod(GENERAL_METHOD)
                  resetSlots()
                }}
                type="button"
              >
                <span className="font-semibold">Sem preferência</span>
                <p
                  className={
                    method === GENERAL_METHOD
                      ? "mt-1 text-sm text-gray-300"
                      : "mt-1 text-sm text-gray-500"
                  }
                >
                  Qualquer profissional disponível
                </p>
              </button>
            ) : null}

            {professionals.map((professional) => {
              const selected = method === professional.id
              return (
                <button
                  aria-pressed={selected}
                  className={
                    selected
                      ? "flex items-center gap-3 rounded-xl border border-gray-950 bg-gray-950 p-3 text-left text-white"
                      : "flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-gray-500"
                  }
                  key={professional.id}
                  onClick={() => {
                    setMethod(professional.id)
                    resetSlots()
                  }}
                  type="button"
                >
                  {professional.photoUrl ? (
                    <img
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                      height={44}
                      src={professional.photoUrl}
                      width={44}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={
                        selected
                          ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 font-semibold"
                          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold"
                      }
                    >
                      {professional.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="font-semibold">{professional.name}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">3. Dia</span>
          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-gray-950"
            type="date"
            value={localDate}
            onChange={(event) => {
              setLocalDate(event.target.value)
              resetSlots()
            }}
            required
          />
        </label>

        <button
          className="rounded-xl bg-gray-950 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={availabilityPending || !localDate}
          onClick={loadAvailability}
          type="button"
        >
          {availabilityPending ? "A consultar..." : "Ver horários"}
        </button>

        {availabilityLoaded ? (
          <div>
            <p className="mb-2 text-sm font-medium">4. Hora</p>
            {slots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    aria-pressed={selectedStart === slot.startsAt}
                    className={
                      selectedStart === slot.startsAt
                        ? "rounded-xl bg-gray-950 px-3 py-3 text-sm font-semibold text-white"
                        : "rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold hover:border-gray-950"
                    }
                    key={slot.startsAt}
                    onClick={() => {
                      setSelectedStart(slot.startsAt)
                      setError(null)
                    }}
                    type="button"
                  >
                    {slot.localTime}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                Não existem horários disponíveis para este dia.
              </p>
            )}
          </div>
        ) : null}

        <form
          className="grid gap-4 border-t border-gray-200 pt-5"
          onSubmit={submitBooking}
        >
          <p className="text-sm font-medium">5. Os teus dados</p>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">Nome</span>
            <input
              autoComplete="name"
              className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-gray-950"
              maxLength={120}
              name="name"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">
              Telemóvel / telefone
            </span>
            <input
              autoComplete="tel"
              className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-gray-950"
              maxLength={32}
              name="phone"
              required
              type="tel"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">
              Email <span className="text-gray-400">(opcional)</span>
            </span>
            <input
              autoComplete="email"
              className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-gray-950"
              maxLength={254}
              name="email"
              type="email"
            />
          </label>

          {error ? (
            <p
              className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {successPendingRedirect ? (
            <p
              className="rounded-xl bg-green-50 p-3 text-sm text-green-800"
              role="status"
            >
              Marcação confirmada. A abrir o teu acesso privado...
            </p>
          ) : null}

          <button
            className="rounded-xl bg-gray-950 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              bookingPending ||
              successPendingRedirect ||
              !selectedStart
            }
            type="submit"
          >
            {bookingPending ? "A confirmar..." : "Confirmar marcação"}
          </button>
        </form>
      </div>
    </section>
  )
}
