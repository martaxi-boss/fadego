"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  issueOwnerInvitation, revokeOwnerInvitation, redeemOwnerInvitation, OwnerInvitationError,
} from "@/lib/owner-invitations"
import { ownerInviteTokenValid } from "@/lib/owner-invitation-policy"

export type OwnerInvitationState = { link: string; error: string }
export async function createOwnerInvitationAction(
  shopId: string, membershipId: string, previous: OwnerInvitationState,
): Promise<OwnerInvitationState> {
  void previous
  try {
    const link = await issueOwnerInvitation(shopId, membershipId)
    revalidatePath("/super-admin/barbearias/" + shopId)
    return { link, error: "" }
  } catch (error) {
    if (error instanceof OwnerInvitationError) {
      return { link: "", error: "Não foi possível criar o convite. Confere a identidade e o estado do acesso." }
    }
    throw error
  }
}

export async function revokeOwnerInvitationAction(shopId: string, invitationId: string) {
  await revokeOwnerInvitation(shopId, invitationId)
  revalidatePath("/super-admin/barbearias/" + shopId)
}

export async function redeemOwnerInvitationAction(token: string, data: FormData) {
  if (!ownerInviteTokenValid(token)) redirect("/login?acesso=equipa")
  try {
    const password = data.get("password")
    const repeat = data.get("repeat")
    await redeemOwnerInvitation(token,
      typeof password === "string" ? password : "",
      typeof repeat === "string" ? repeat : "")
  } catch (error) {
    if (error instanceof OwnerInvitationError) {
      const reason = error.code === "PASSWORD" ? "palavra-passe" : error.code === "SIGN_IN" ? "sessao" : "invalido"
      redirect("/aceitar-negocio/" + token + "?erro=" + reason)
    }
    throw error
  }
  redirect("/login?acesso=equipa&convite=aceite")
}
