import Link from "next/link"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-20">
      <section className="max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-[0.2em] text-gray-500">
          FADEGO
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Gestão autónoma para barbearias.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
          Fundação administrativa multi-tenant. Os módulos operacionais de
          reservas, cadeiras, serviços, Club e pagamentos entram nas fases
          seguintes.
        </p>
        <Link
          className="mt-8 inline-flex rounded-lg bg-gray-950 px-5 py-3 font-medium text-white"
          href="/login"
        >
          Acesso administrativo
        </Link>
      </section>
    </main>
  )
}
