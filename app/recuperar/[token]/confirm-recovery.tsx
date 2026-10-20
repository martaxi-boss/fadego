"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, ShieldCheck } from "lucide-react"

export default function ConfirmRecovery({ token }: { token: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redeem = async () => {
    setError(null)
    setPending(true)
    try {
      const response = await fetch("/api/public/recovery/redeem", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const result = (await response.json()) as
        | { ok: true; accessPath: string }
        | { ok: false; code: string }
      if (result.ok) {
        router.replace(result.accessPath)
        return
      }
      setError(result.code === "RATE_LIMITED"
        ? "Demasiadas tentativas. Tenta novamente mais tarde."
        : "Este link já foi utilizado ou expirou. Pede um novo link de recuperação à barbearia.")
    } catch {
      setError("Ocorreu um erro de ligação. Tenta novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-xl sm:p-10">
      <div className="grid size-14 place-items-center rounded-2xl bg-[#dcefdc] text-[#21724e]">
        <ShieldCheck aria-hidden="true" className="size-7" />
      </div>
      <h1 className="mt-6 text-3xl font-black tracking-[-0.045em] text-[#173e2d]">Confirmar recuperação</h1>
      <p className="mt-4 text-sm leading-7 text-[#5c7463]">
        Ao confirmar, será criado um novo link privado para a tua reserva e
        o antigo deixará de funcionar. O pedido só pode ser utilizado uma vez.
      </p>
      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
      <button type="button" onClick={redeem} disabled={pending}
        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#17583b] px-6 py-3.5 font-bold text-white disabled:opacity-55">
        {pending ? "A confirmar..." : "Recuperar acesso"}
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </section>
  )
}
