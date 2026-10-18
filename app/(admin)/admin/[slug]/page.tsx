import Link from "next/link"
import { redirect } from "next/navigation"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { tenantModulesForRole } from "@/lib/admin-navigation"
import { tenantSubdomainUrl } from "@/lib/tenant-subdomains"
import { db } from "@/lib/prisma"

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const access = await requireBarbershopBySlug(slug, [
    "OWNER",
    "ADMIN",
    "STAFF",
  ])
  if (access.membership.role === "STAFF") {
    redirect("/admin/" + access.barbershop.slug + "/barbeiro")
  }
  const isManager = access.membership.role !== "STAFF"
  const modules = tenantModulesForRole(access.membership.role)
  const shopId = access.barbershop.id

  const [chairs, services, professionals, openingHours, gmail] = await Promise.all([
    db.chair.count({ where: { barbershopId: shopId, active: true } }),
    db.service.count({ where: { barbershopId: shopId, active: true } }),
    db.staffMember.count({ where: { barbershopId: shopId, active: true, archivedAt: null } }),
    db.openingHour.count({ where: { barbershopId: shopId, isClosed: false } }),
    isManager
      ? db.gmailSenderConnection.findUnique({
          where: { barbershopId: shopId },
          select: { email: true, sendingEnabledAt: true },
        })
      : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] bg-[#163e31] p-7 text-white sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b4e8bf]">
          {isManager ? "Painel administrativo da barbearia" : "Área de funcionário"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          {access.barbershop.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#dceae0]">
          {isManager
            ? "Controla a agenda, equipa, cadeiras, serviços, horários e o Gmail deste negócio. O FADEGO central não gere a tua rotina."
            : "Consulta a agenda e os módulos de trabalho permitidos pela tua função. As informações pessoais dos clientes e a ligação Gmail são reservadas à administração."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#153d2b]"
            href={"/admin/" + slug + "/agenda"}
          >
            Abrir agenda
          </Link>
          {isManager ? (
            <Link
              className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white"
              href={"/admin/" + slug + "/contact"}
            >
              Gerir Gmail
            </Link>
          ) : null}
          <Link
            className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white"
            href={"/admin/" + slug + "/barbeiro"}
          >
            Ver painéis dos barbeiros
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumo operacional">
        {[
          { label: "Cadeiras", count: chairs },
          { label: "Serviços", count: services },
          { label: "Profissionais", count: professionals },
          { label: "Dias com horário", count: openingHours },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-[#667a6c]">{metric.label}</p>
            <p className="mt-2 text-2xl font-black text-[#1a4532]">{metric.count}</p>
          </div>
        ))}
      </section>

      {isManager ? (
        <section className="rounded-xl border border-[#dbe9e0] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#204431]">A tua página e o teu Gmail</h2>
          <p className="mt-2 break-all text-sm text-[#5f7465]">
            Página dos clientes: {tenantSubdomainUrl(slug) ?? "/b/" + slug}
          </p>
          <p className="mt-1 text-sm text-[#5f7465]">
            {tenantSubdomainUrl(slug)
              ? "Subdomínio próprio ligado ao espaço do negócio."
              : "Subdomínio próprio ainda não ativado. O endereço /b/ continua disponível quando o negócio estiver apto para reservas."}
          </p>
          <p className="mt-3 text-sm font-semibold text-[#244b36]">
            Gmail: {gmail?.email ?? "Por ligar"}
          </p>
          <p className="mt-1 text-xs leading-6 text-[#607266]">
            {gmail?.sendingEnabledAt
              ? "O Gmail está autorizado nesta conta, mas os envios dependem ainda da porta global de segurança do FADEGO."
              : "Só o proprietário ou um administrador pode autorizar a própria conta Google. Os envios reais continuam desativados no piloto."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="rounded-lg border border-[#9dbfa9] px-4 py-2.5 text-sm font-bold text-[#205237]"
              href={"/b/" + slug}>
              Ver página dos clientes
            </Link>
            <Link className="rounded-lg border border-[#9dbfa9] px-4 py-2.5 text-sm font-bold text-[#205237]"
              href={"/admin/" + slug + "/contact"}>
              Ligar Gmail do negócio
            </Link>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-xl font-bold text-[#193d2d]">
          {isManager ? "Gerir este negócio" : "Ferramentas da equipa"}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((module) => (
            <Link
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-[#96baa3]"
              href={"/admin/" + slug + "/" + module.href}
              key={module.href}
            >
              <h3 className="font-bold">{module.label}</h3>
              <p className="mt-2 text-sm leading-6 text-[#647468]">{module.detail}</p>
            </Link>
          ))}
        </div>
      </section>
      <p className="text-xs text-[#607367]">
        Cada utilizador só tem acesso às barbearias e permissões que lhe foram atribuídas.
        Cobranças e envios de Gmail reais continuam desativados.
      </p>
    </div>
  )
}
