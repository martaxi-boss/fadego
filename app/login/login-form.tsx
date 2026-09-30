"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

const GENERIC_ERROR = "Email ou palavra-passe inválidos."

export default function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const result = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    })

    setPending(false)

    if (!result?.ok) {
      setError(GENERIC_ERROR)
      return
    }

    router.replace("/admin")
    router.refresh()
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Palavra-passe</span>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-gray-950 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "A entrar..." : "Entrar"}
      </button>
    </form>
  )
}
