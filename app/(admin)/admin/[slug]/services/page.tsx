import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import ConfigNotice from "@/app/_components/config-notice"
import { createServiceAction, updateServiceAction } from "../actions"

const firstNotice = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ notice?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const access = await requireBarbershopBySlug(slug, [
    "OWNER",
    "ADMIN",
    "STAFF",
  ])
  const canManage =
    access.membership.role === "OWNER" || access.membership.role === "ADMIN"

  const services = await db.service.findMany({
    where: { barbershopId: access.barbershop.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
  const createAction = createServiceAction.bind(null, access.barbershop.slug)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Serviços</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Cada serviço tem preço definido pela barbearia e uma duração positiva
          em múltiplos de 15 minutos.
        </p>
      </section>

      <ConfigNotice notice={firstNotice(query.notice)} />

      <datalist id="fadego-duration-presets">
        <option value="15">Retoque / contornos</option>
        <option value="30">Barba</option>
        <option value="45">Corte</option>
        <option value="60">Corte + barba</option>
      </datalist>

      {canManage ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Adicionar serviço</h2>
          <form action={createAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nome</span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Preço (€)</span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                min="0"
                name="price"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium">
                Descrição opcional
              </span>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={1000}
                name="description"
                rows={3}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Duração (minutos)
              </span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                list="fadego-duration-presets"
                min="15"
                name="durationMinutes"
                required
                step="15"
                type="number"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Sugestões: 15, 30, 45 ou 60. Outros múltiplos de 15 também são
                aceites.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Estado</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue="true"
                name="active"
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white"
                type="submit"
              >
                Adicionar
              </button>
            </div>
          </form>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          A tua role STAFF permite consultar esta configuração, mas não
          alterá-la.
        </p>
      )}

      <section className="space-y-4">
        {services.map((service) => {
          const updateAction = updateServiceAction.bind(
            null,
            access.barbershop.slug,
            service.id,
          )

          return (
            <article
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              key={service.id}
            >
              <div className="mb-4">
                <h2 className="font-semibold">{service.name}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  €{service.price.toFixed(2)} · {service.durationMinutes} min ·{" "}
                  {service.active ? "Ativo" : "Inativo"}
                </p>
              </div>

              {canManage ? (
                <form action={updateAction} className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Nome</span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={service.name}
                      maxLength={120}
                      name="name"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Preço (€)
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={service.price.toFixed(2)}
                      min="0"
                      name="price"
                      required
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">
                      Descrição opcional
                    </span>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={service.description ?? ""}
                      maxLength={1000}
                      name="description"
                      rows={3}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Duração (minutos)
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={service.durationMinutes}
                      list="fadego-duration-presets"
                      min="15"
                      name="durationMinutes"
                      required
                      step="15"
                      type="number"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Estado
                    </span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={service.active ? "true" : "false"}
                      name="active"
                    >
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </label>
                  <div className="md:col-span-2">
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      type="submit"
                    >
                      Guardar serviço
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-gray-600">
                  {service.description ?? "Sem descrição."}
                </p>
              )}
            </article>
          )
        })}

        {services.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Ainda não existem serviços configurados.
          </p>
        ) : null}
      </section>
    </div>
  )
}
