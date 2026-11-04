"use client"

import { useActionState } from "react"
import { createStaffInvitationAction, type InvitationFormState } from "./actions"

export default function StaffInvitationForm({
  slug, available,
}: {
  slug: string
  available: Array<{ id: string; name: string }>
}) {
  const initial: InvitationFormState = { link: "", error: "" }
  const [state, action, pending] = useActionState(
    createStaffInvitationAction.bind(null, slug), initial,
  )
  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-black text-[#1d4834]">Dar acesso a um barbeiro</h2>
      <p className="text-sm text-gray-600">
        O funcionário define a própria palavra-passe através de um convite
        válido durante 48 horas. Nunca tens de saber a palavra-passe dele.
      </p>
      <label className="text-sm font-semibold">Profissional existente
        <select name="staffMemberId" required defaultValue=""
          className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
          <option value="" disabled>Escolher profissional</option>
          {available.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">Email pessoal do funcionário
        <input type="email" name="email" required maxLength={254}
          className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
      </label>
      <button disabled={pending || available.length === 0} type="submit"
        className="rounded-lg bg-[#1c583b] px-5 py-3 font-bold text-white disabled:opacity-50">
        {pending ? "A criar..." : "Criar convite seguro"}
      </button>
      {state.error ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{state.error}</p> : null}
      {state.link ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-bold text-[#245237]">Convite criado — copia e envia apenas ao funcionário</p>
          <p className="mt-2 text-xs leading-5 text-[#45634f]">
            O link é mostrado só agora. Não o publiques em grupos; dá acesso
            a uma conta profissional da tua barbearia.
          </p>
          <textarea aria-label="Link privado do convite" readOnly rows={3}
            value={state.link}
            className="mt-3 w-full rounded-lg border border-emerald-200 bg-white p-3 text-xs" />
        </div>
      ) : null}
    </form>
  )
}
