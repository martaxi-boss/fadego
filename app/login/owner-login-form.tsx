"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

const GENERIC_ERROR = "Palavra-passe inválida. Verifica e tenta novamente."

export default function OwnerLoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(event.currentTarget)

    try {
      const result = await signIn("owner-password", {
        password: String(form.get("password") ?? ""),
        redirect: false,
      })
      if (!result?.ok) {
        setError(GENERIC_ERROR)
        return
      }
      router.replace("/super-admin")
      router.refresh()
    } catch {
      setError("Não foi possível entrar. Verifica a ligação e tenta novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit} autoComplete="on">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">A tua palavra-passe</span>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-3 outline-none focus:border-[#2f785a]"
          type="password"
          name="password"
          autoComplete="current-password"
          enterKeyHint="go"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "owner-login-error" : undefined}
          required
        />
      </label>
      {error ? (
        <p id="owner-login-error" role="alert" className="text-sm text-red-700">{error}</p>
      ) : null}
      <button
        className="w-full rounded-xl bg-[#173d2f] px-4 py-3 font-semibold text-white disabled:opacity-50"
        type="submit"
        disabled={pending}
      >
        {pending ? "A entrar..." : "Entrar no meu portal"}
      </button>
      <p className="text-xs leading-6 text-[#687f71]">
        Quando o telemóvel sugerir guardar esta palavra-passe, podes aceitar.
        O FADEGO não guarda a palavra-passe no navegador.
      </p>
    </form>
  )
}
