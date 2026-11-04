import { z } from "zod"
import {
  authenticateCredentialCandidate,
  type CredentialIdentity,
  type CredentialRecord,
} from "@/lib/credential-policy"

export const ownerPortalPasswordSchema = z.object({
  password: z.string().min(1).max(512),
})

// The server must load active SUPER_ADMIN identities only (never use a
// client-provided username/email). Any ambiguity fails closed rather than
// guessing which privileged identity should be authenticated.
export async function authenticateSingleOwner(
  records: readonly CredentialRecord[],
  password: string,
  verify: (password: string, encoded: string) => Promise<boolean>,
): Promise<CredentialIdentity | null> {
  if (records.length !== 1) return null
  return authenticateCredentialCandidate(records[0], password, verify)
}
