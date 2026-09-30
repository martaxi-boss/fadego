"use client"

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
      onClick={() => signOut({ callbackUrl: "/login" })}
      type="button"
    >
      Sair
    </button>
  )
}
