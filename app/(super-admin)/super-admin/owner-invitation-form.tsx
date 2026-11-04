"use client"

import { useActionState } from "react"
import { createOwnerInvitationAction, type OwnerInvitationState } from "./owner-invitation-actions"

export default function OwnerInvitationForm({ shopId, membershipId }: { shopId: string; membershipId: string }) {
  const [state, action, pending] = useActionState(
    createOwnerInvitationAction.bind(null, shopId, membershipId), { link: "", error: "" } as OwnerInvitationState,
  )
  return <form action={action} className="mt-3 space-y-3">
    <button type="submit" disabled={pending}
      className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
      {pending ? "A criar convite..." : "Convidar proprietário"}
    </button>
    {state.error ? <p role="alert" className="text-sm text-amber-900">{state.error}</p> : null}
    {state.link ? <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="font-bold">Convite criado. Entrega-o apenas ao proprietário indicado.</p>
      <p className="mt-2">O proprietário escolhe a própria palavra-passe. O link expira em 48 horas e é mostrado só agora.</p>
      <textarea aria-label="Convite privado do proprietário" value={state.link} readOnly rows={3}
        className="mt-3 w-full rounded-lg border border-emerald-200 bg-white p-3 text-xs" />
    </div> : null}
  </form>
}
