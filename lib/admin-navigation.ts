// Shared source of truth for the tenant's administrative navigation and cards.
// Server-side authorization on each route remains mandatory.
export type TenantAdminRole = "OWNER" | "ADMIN" | "STAFF"

export type TenantAdminModule = {
  href: string
  label: string
  detail: string
  managerOnly?: boolean
  staffOnly?: boolean
}

export const TENANT_ADMIN_MODULES: readonly TenantAdminModule[] = [
  { href: "barbeiro", label: "O meu painel", detail: "A minha agenda, próximas marcações e atendimentos.", staffOnly: true },
  { href: "agenda", label: "Agenda", detail: "Consulta as reservas do dia, profissionais e estados.", managerOnly: true },
  { href: "customers", label: "Clientes", detail: "Contactos, marcações e adesões Club.", managerOnly: true },
  { href: "professionals", label: "Profissionais", detail: "Equipa, fotografias e ciclo de vida.", managerOnly: true },
  { href: "chairs", label: "Cadeiras", detail: "Até cinco cadeiras com atendimento geral ou profissional.", managerOnly: true },
  { href: "services", label: "Serviços", detail: "Preços, duração e disponibilidade.", managerOnly: true },
  { href: "hours", label: "Horários", detail: "Horário semanal da barbearia.", managerOnly: true },
  { href: "club", label: "Club", detail: "Planos, adesões e gestão das utilizações.", managerOnly: true },
  { href: "contact", label: "Gmail", detail: "Ligar o Gmail do negócio com a Google e definir o email para respostas.", managerOnly: true },
]

export const tenantModulesForRole = (role: TenantAdminRole) =>
  TENANT_ADMIN_MODULES.filter((module) =>
    role === "STAFF" ? module.staffOnly === true : module.staffOnly !== true,
  )
