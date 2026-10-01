const messages: Record<string, string> = {
  saved: "Alterações guardadas.",
  invalid: "Verifica os dados introduzidos e tenta novamente.",
  assignment:
    "Só é possível fazer uma nova atribuição a um profissional ativo e não arquivado da mesma barbearia.",
  "club-assignment":
    "Só é possível adicionar ao plano um Serviço ativo da mesma barbearia.",
  "not-found": "O recurso já não está disponível neste tenant.",
  "rate-limit":
    "Foram feitas demasiadas alterações num curto período. Tenta novamente dentro de instantes.",
  "write-failed": "Não foi possível guardar a alteração.",
}

export default function ConfigNotice({ notice }: { notice?: string }) {
  if (!notice || !(notice in messages)) return null

  const success = notice === "saved"

  return (
    <p
      className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
        success
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
      role="status"
    >
      {messages[notice]}
    </p>
  )
}
