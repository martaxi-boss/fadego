// Shared source of truth for the tenant's administrative navigation and cards.
// Server-side authorization on each route remains mandatory.
export type TenantAdminRole = "OWNER" | "ADMIN" | "STAFF"

export type TenantAdminModule = {
  href: string
  label: string
  detail: string
  managerOnly?: boolean
}

export const TENANT_ADMIN_MODULES: readonly TenantAdminModule[] = [
  { href: "agenda", label: "Agenda", detail: "Consulta as reservas do dia, profissionais e estados." },
  { href: "customers", label: "Clientes", detail: "Contactos, marcações e adesões Club.", managerOnly: true },
  { href: "professionals", label: "Profissionais", detail: "Equipa, fotografias e ciclo de vida." },
  { href: "chairs", label: "Cadeiras", detail: "Até cinco cadeiras com atendimento geral ou profissional." },
  { href: "services", label: "Serviços", detail: "Preços, duração e disponibilidade." },
  { href: "hours", label: "Horários", detail: "Horário semanal da barbearia." },
  { href: "club", label: "Club", detail: "Planos, adesões e gestão das utilizações." },
  { href: "contact", label: "Gmail", detail: "Ligar o Gmail do negócio com a Google e definir o email para respostas.", managerOnly: true },
]

export const tenantModulesForRole = (role: TenantAdminRole) =>
  TENANT_ADMIN_MODULES.filter((module) => !module.managerOnly || role !== "STAFF")
