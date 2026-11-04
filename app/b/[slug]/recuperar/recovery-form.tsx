"use client"

import Link from "next/link"
import { type FormEvent, useState } from "react"
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react"

export default function BookingRecoveryForm({ slug }: { slug: string }) {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const result = await fetch(
        "/api/public/barbershops/" + encodeURIComponent(slug) + "/recovery", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(form.get("email") ?? ""),
            phone: String(form.get("phone") ?? ""),
            localDate: String(form.get("localDate") ?? ""),
          }),
        },
      )
      const json = (await result.json()) as
        | { ok: true }
        | { ok: false; code: string }
      if (json.ok) {
        setDone(true)
        return
      }
      setError(json.code === "EMAIL_UNAVAILABLE"
        ? "O serviço de recuperação por email ainda não está disponível. Contacta a barbearia."
        : json.code === "RATE_LIMITED"
          ? "Demasiadas tentativas. Tenta novamente mais tarde."
          : "Confirma os dados e tenta novamente.")
    } catch {
      setError("Não foi possível pedir o acesso. Tenta novamente mais tarde.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-[#e1e8e0] bg-white p-6 shadow-sm sm:p-9">
      <Link href={"/b/" + encodeURIComponent(slug)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#426b58]">
        <ArrowLeft aria-hidden="true" className="size-4" /> Voltar à barbearia
      </Link>
      <div className="mt-8 grid size-14 place-items-center rounded-2xl bg-[#deeee0] text-[#257454]">
        <Mail aria-hidden="true" className="size-7" />
      </div>
      <h1 className="mt-5 text-3xl font-black tracking-[-0.05em] text-[#193a2d]">Recuperar a minha marcação</h1>
      <p className="mt-3 text-sm leading-7 text-[#647769]">
        Perdeste o código ou o link? Indica o email, o telefone e o dia
        em que a marcação está atualmente agendada. Se já mudaste a data,
        utiliza o novo dia. Se os dados coincidirem com uma marcação,
        receberás um link de recuperação no teu email.
      </p>
      {done ? (
        <div className="mt-7 rounded-2xl border border-[#cfe8ce] bg-[#f0f8ef] p-5 text-sm leading-7 text-[#29563d]" role="status">
          <ShieldCheck aria-hidden="true" className="mb-3 size-6" />
          Se encontrarmos uma marcação com estes dados, receberás uma mensagem
          com um link válido por 20 minutos. Confirma também a pasta de spam.
          Não precisas de criar conta.
        </div>
      ) : (
        <form className="mt-8 grid gap-5" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-semibold text-[#294b3a]">
            Email da reserva
            <input className="w-full rounded-xl border border-[#d0ddd2] px-4 py-3 font-normal text-[#18382a] outline-none focus:border-[#458769]" name="email" autoComplete="email" type="email" maxLength={254} required />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#294b3a]">
            Telemóvel / telefone da reserva
            <input className="w-full rounded-xl border border-[#d0ddd2] px-4 py-3 font-normal text-[#18382a] outline-none focus:border-[#458769]" name="phone" autoComplete="tel" type="tel" maxLength={32} required />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#294b3a]">
            Dia da marcação
            <input className="w-full rounded-xl border border-[#d0ddd2] px-4 py-3 font-normal text-[#18382a] outline-none focus:border-[#458769]" name="localDate" type="date" required />
          </label>
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
          <button className="rounded-full bg-[#1d5a41] px-6 py-3.5 font-bold text-white transition hover:bg-[#144631] disabled:opacity-55" type="submit" disabled={pending}>
            {pending ? "A verificar..." : "Enviar link para o meu email"}
          </button>
          <p className="text-xs leading-6 text-[#718579]">
            Por privacidade, a resposta é igual mesmo quando não encontramos a reserva.
          </p>
        </form>
      )}
    </section>
  )
}
