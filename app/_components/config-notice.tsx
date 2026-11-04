const messages: Record<string, string> = {
  saved: "Alterações guardadas.",
  invalid: "Verifica os dados introduzidos e tenta novamente.",
  assignment:
    "Só é possível fazer uma nova atribuição a um profissional ativo e não arquivado da mesma barbearia.",
  "club-assignment":
    "Só é possível adicionar ao plano um Serviço ativo da mesma barbearia.",
  "club-plan-unavailable":
    "O plano selecionado já não aceita novas adesões.",
  "club-usage-unavailable":
    "Esta ação Club já não está disponível para o estado ou ciclo atual.",
  "club-limit":
    "O limite incluído deste Serviço já foi atingido no ciclo atual.",
  "not-found": "O recurso já não está disponível neste tenant.",
  "rate-limit":
    "Foram feitas demasiadas alterações num curto período. Tenta novamente dentro de instantes.",
  "write-failed": "Não foi possível guardar a alteração.",
  "gmail-unavailable": "Ligação Gmail ou autorização global ainda não configurada.",
  "gmail-invalid": "Pedido de ligação Gmail inválido ou expirado. Inicia novamente.",
  "gmail-cancelled": "Ligação Gmail cancelada. Nada foi autorizado.",
  "gmail-failed": "Não foi possível confirmar a ligação Gmail. Nenhuma mensagem foi enviada.",
  "gmail-connected": "Gmail ligado com sucesso. O envio automático continua desativado.",
  "gmail-not-connected": "Não existe uma ligação Gmail pronta para ativar.",
  "gmail-confirmation-required": "Confirma expressamente a autorização de envio.",
  "gmail-activated": "Envio pelo Gmail autorizado nesta barbearia.",
  "gmail-paused": "Envio pelo Gmail pausado.",
  "gmail-disconnected": "Ligação Gmail removida do FADEGO.",
}

export default function ConfigNotice({ notice }: { notice?: string }) {
  if (!notice || !(notice in messages)) return null

  const success = ["saved", "gmail-connected", "gmail-activated", "gmail-paused", "gmail-disconnected"].includes(notice)

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
