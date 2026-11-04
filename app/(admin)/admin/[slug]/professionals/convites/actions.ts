"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  issueStaffInvitation, redeemStaffInvitation, revokeStaffInvitation,
  StaffInvitationError,
} from "@/lib/staff-invitations"

export type InvitationFormState = { link: string; error: string }

export async function createStaffInvitationAction(
  slug: string, previous: InvitationFormState, formData: FormData,
): Promise<InvitationFormState> {
  void previous
  const profile = formData.get("staffMemberId")
  const email = formData.get("email")
  try {
    const link = await issueStaffInvitation(
      slug,
      typeof profile === "string" ? profile : "",
      typeof email === "string" ? email : "",
    )
    revalidatePath("/admin/" + slug + "/professionals/convites")
    return { link, error: "" }
  } catch (error) {
    if (error instanceof StaffInvitationError) {
      return { link: "", error: "Não foi possível emitir o convite. Verifica a conta e o profissional." }
    }
    throw error
  }
}

export async function revokeStaffInvitationAction(slug: string, invitationId: string) {
  await revokeStaffInvitation(slug, invitationId)
  revalidatePath("/admin/" + slug + "/professionals/convites")
  redirect("/admin/" + slug + "/professionals/convites")
}

export async function redeemStaffInvitationAction(token: string, data: FormData) {
  const password = data.get("password")
  const repeat = data.get("repeat")
  try {
    await redeemStaffInvitation(
      token,
      typeof password === "string" ? password : "",
      typeof repeat === "string" ? repeat : "",
    )
  } catch (error) {
    if (error instanceof StaffInvitationError) {
      const reason = error.code === "PASSWORD" ? "palavra-passe"
        : error.code === "SIGN_IN_REQUIRED" ? "sessao" : "invalido"
      redirect("/aceitar-equipa/" + token + "?erro=" + reason)
    }
    throw error
  }
  redirect("/login?acesso=equipa&convite=aceite")
}
