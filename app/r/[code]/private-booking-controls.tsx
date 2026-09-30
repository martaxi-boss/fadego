"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  buildQrMatrix,
  privateQrPayload,
  type QrMatrix,
} from "@/lib/qr-code"

type Slot = {
  startsAt: string
  localTime: string
}

type ControlsProps = {
  code: string
  canCancel: boolean
  canReschedule: boolean
}

const genericError = "Não foi possível concluir esta ação. Tenta novamente."
const staleError =
  "Esse horário acabou de ficar indisponível. Escolhe outro horário."

export default function PrivateBookingControls({
  code,
  canCancel,
  canReschedule,
}: ControlsProps) {
  const router = useRouter()
  const [matrix, setMatrix] = useState<QrMatrix | null>(null)
  const [qrError, setQrError] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [localDate, setLocalDate] = useState("")
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedStart, setSelectedStart] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const payload = privateQrPayload(window.location.href)
      setMatrix(buildQrMatrix(payload))
    } catch {
      setQrError(true)
    }
  }, [])

  const qrSize = matrix?.length ?? 0
  const qrViewBoxSize = qrSize + 8

  const slotButtons = useMemo(
    () =>
      slots.map((slot) => (
        <button
          aria-pressed={selectedStart === slot.startsAt}
          className={
            selectedStart === slot.startsAt
              ? "rounded-lg bg-gray-950 px-3 py-2 text-sm font-medium text-white"
              : "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"
          }
          key={slot.startsAt}
          onClick={() => setSelectedStart(slot.startsAt)}
          type="button"
        >
          {slot.localTime}
        </button>
      )),
    [selectedStart, slots],
  )

  const loadAvailability = async () => {
    if (!localDate) {
      setRescheduleError("Escolhe primeiro um dia.")
      return
    }

    setLoadingSlots(true)
    setRescheduleError(null)
    setSelectedStart("")

    try {
      const response = await fetch(
        `/api/private/bookings/${encodeURIComponent(code)}/availability`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localDate }),
        },
      )
      const result = (await response.json()) as
        | {
            ok: true
            availability: {
              slots: Array<{ startsAt: string; localTime: string }>
            }
          }
        | { ok: false; code: string }

      if (!result.ok) {
        setSlots([])
        setRescheduleError(
          result.code === "RATE_LIMITED"
            ? "Demasiadas tentativas. Tenta novamente mais tarde."
            : result.code === "ACTION_UNAVAILABLE"
              ? "Esta marcação já não pode ser remarcada por este acesso."
              : genericError,
        )
        return
      }

      const nextSlots = result.availability.slots
      setSlots(nextSlots)
      if (nextSlots.length === 0) {
        setRescheduleError("Não existem horários disponíveis nesse dia.")
      }
    } catch {
      setSlots([])
      setRescheduleError(genericError)
    } finally {
      setLoadingSlots(false)
    }
  }

  const cancel = async () => {
    if (!window.confirm("Queres mesmo cancelar esta marcação?")) return

    setCancelling(true)
    setCancelError(null)

    try {
      const response = await fetch(
        `/api/private/bookings/${encodeURIComponent(code)}/cancel`,
        {
          method: "POST",
          cache: "no-store",
        },
      )
      const result = (await response.json()) as
        | { ok: true }
        | { ok: false; code: string }

      if (!result.ok) {
        setCancelError(
          result.code === "RATE_LIMITED"
            ? "Demasiadas tentativas. Tenta novamente mais tarde."
            : result.code === "ACTION_UNAVAILABLE"
              ? "Esta marcação já não pode ser cancelada."
              : genericError,
        )
        return
      }

      router.refresh()
    } catch {
      setCancelError(genericError)
    } finally {
      setCancelling(false)
    }
  }

  const reschedule = async () => {
    if (!selectedStart) {
      setRescheduleError("Escolhe um horário.")
      return
    }

    if (!window.confirm("Queres remarcar para o horário escolhido?")) return

    setRescheduling(true)
    setRescheduleError(null)

    try {
      const response = await fetch(
        `/api/private/bookings/${encodeURIComponent(code)}/reschedule`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt: selectedStart }),
        },
      )
      const result = (await response.json()) as
        | { ok: true }
        | { ok: false; code: string }

      if (!result.ok) {
        if (result.code === "SLOT_UNAVAILABLE") {
          setRescheduleError(staleError)
          await loadAvailability()
          return
        }

        setRescheduleError(
          result.code === "RATE_LIMITED"
            ? "Demasiadas tentativas. Tenta novamente mais tarde."
            : result.code === "ACTION_UNAVAILABLE"
              ? "Esta marcação já não pode ser remarcada por este acesso."
              : genericError,
        )
        return
      }

      setSlots([])
      setSelectedStart("")
      router.refresh()
    } catch {
      setRescheduleError(genericError)
    } finally {
      setRescheduling(false)
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section
        aria-labelledby="private-qr-title"
        className="rounded-xl border border-gray-200 bg-gray-50 p-4"
      >
        <h2 className="font-semibold" id="private-qr-title">
          QR da marcação
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Este QR dá acesso à tua marcação. Guarda-o em privado.
        </p>
        {matrix ? (
          <svg
            aria-label="QR Code do acesso privado à marcação"
            className="mt-4 h-auto w-full max-w-56 rounded-lg bg-white p-2"
            role="img"
            viewBox={`0 0 ${qrViewBoxSize} ${qrViewBoxSize}`}
          >
            <rect
              height={qrViewBoxSize}
              width={qrViewBoxSize}
              x="0"
              y="0"
              fill="white"
            />
            {matrix.flatMap((row, rowIndex) =>
              row.map((dark, columnIndex) =>
                dark ? (
                  <rect
                    fill="black"
                    height="1"
                    key={`${rowIndex}-${columnIndex}`}
                    width="1"
                    x={columnIndex + 4}
                    y={rowIndex + 4}
                  />
                ) : null,
              ),
            )}
          </svg>
        ) : qrError ? (
          <p className="mt-3 text-sm text-red-700">
            Não foi possível gerar o QR neste dispositivo.
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">A gerar QR...</p>
        )}
      </section>

      {canCancel ? (
        <section className="rounded-xl border border-red-200 bg-white p-4">
          <h2 className="font-semibold">Cancelar marcação</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            O cancelamento mantém este acesso disponível para consultares o
            histórico da marcação.
          </p>
          {cancelError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {cancelError}
            </p>
          ) : null}
          <button
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
            disabled={cancelling}
            onClick={cancel}
            type="button"
          >
            {cancelling ? "A cancelar..." : "Cancelar marcação"}
          </button>
        </section>
      ) : null}

      {canReschedule ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-semibold">Remarcar</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Escolhe outro dia e um horário disponível. O serviço e o
            profissional, quando existe, mantêm-se.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium">Novo dia</span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                onChange={(event) => {
                  setLocalDate(event.target.value)
                  setSlots([])
                  setSelectedStart("")
                  setRescheduleError(null)
                }}
                type="date"
                value={localDate}
              />
            </label>
            <button
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={loadingSlots || !localDate}
              onClick={loadAvailability}
              type="button"
            >
              {loadingSlots ? "A procurar..." : "Ver horários"}
            </button>
          </div>

          {slots.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Horários disponíveis</p>
              <div className="mt-2 flex flex-wrap gap-2">{slotButtons}</div>
              <button
                className="mt-4 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!selectedStart || rescheduling}
                onClick={reschedule}
                type="button"
              >
                {rescheduling ? "A remarcar..." : "Confirmar remarcação"}
              </button>
            </div>
          ) : null}

          {rescheduleError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {rescheduleError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
