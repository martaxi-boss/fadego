export interface CredentialRecord {
  id: string
  name: string | null
  email: string
  passwordHash: string
  active: boolean
}

export interface CredentialIdentity {
  id: string
  name: string | null
  email: string
}

export const authenticateCredentialCandidate = async (
  record: CredentialRecord | null,
  password: string,
  verify: (password: string, encoded: string) => Promise<boolean>,
): Promise<CredentialIdentity | null> => {
  if (!record?.active) return null

  const valid = await verify(password, record.passwordHash)
  if (!valid) return null

  return {
    id: record.id,
    name: record.name,
    email: record.email,
  }
}
