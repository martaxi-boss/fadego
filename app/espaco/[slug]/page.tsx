import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const central = process.env.NEXTAUTH_URL ?? "https://fadego.duckdns.org"
const centralUrl = (path: string) => new URL(path, central).toString()

export default async function BusinessSpacePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const shop = await db.barbershop.findUnique({
    where: { slug },
    select: { name: true, slug: true, status: true, logoUrl: true },
  })
  if (!shop || shop.status !== "ACTIVE") notFound()

  return (
    <main className="min-h-screen bg-[#f5f8f2] px-4 py-8 text-[#173c2d] sm:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center gap-3">
          <Image src="/fadego-mark.webp" alt="" width={45} height={45} className="size-11 rounded-xl" />
          <div>
            <p className="text-xl font-black tracking-tight">FADEGO</p>
            <p className="text-xs text-[#63806d]">Espaço independente do negócio</p>
          </div>
        </header>
        <section className="mt-8 rounded-[2rem] bg-[#153c30] p-7 text-white shadow-lg sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#bdeac9]">Bem-vindo à barbearia</p>
          <div className="mt-5 flex items-center gap-4">
            {shop.logoUrl ? <img src={shop.logoUrl} width={64} height={64} alt="" className="size-16 rounded-xl object-cover" /> : null}
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{shop.name}</h1>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#d9eadd]">
            Este é o espaço próprio da tua barbearia. Clientes, funcionários e responsáveis
            têm entradas distintas e só acedem às funções autorizadas.
          </p>
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-[#dce8de] bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#4a8261]">Clientes</p>
            <h2 className="mt-2 text-xl font-black">Marcar e gerir reserva</h2>
            <p className="mt-3 text-sm leading-6 text-[#5e7366]">
              Marcações sem criar uma conta FADEGO. O email é obrigatório na reserva;
              o link ou código privado permite consultar, alterar e cancelar.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={"/b/" + shop.slug} className="rounded-lg bg-[#173e2f] px-4 py-3 text-sm font-bold text-white">
                Marcar serviço
              </Link>
              <Link href={"/b/" + shop.slug + "/recuperar"} className="rounded-lg border border-[#9bbda8] px-4 py-3 text-sm font-bold text-[#205137]">
                Recuperar reserva
              </Link>
            </div>
          </section>
          <section className="rounded-2xl border border-[#dce8de] bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#4a8261]">Proprietário e administração</p>
            <h2 className="mt-2 text-xl font-black">Painel da barbearia</h2>
            <p className="mt-3 text-sm leading-6 text-[#5e7366]">
              Agenda, serviços, preços, equipa, cadeiras, horários, clientes, Club
              e ligação do Gmail do próprio negócio.
            </p>
            <a href={centralUrl("/admin/" + shop.slug)}
              className="mt-5 inline-block rounded-lg bg-[#173e2f] px-4 py-3 text-sm font-bold text-white">
              Entrar na administração
            </a>
          </section>
          <section className="rounded-2xl border border-[#dce8de] bg-white p-6 shadow-sm md:col-span-2">
            <p className="text-xs font-bold uppercase tracking-widest text-[#4a8261]">Funcionários</p>
            <h2 className="mt-2 text-xl font-black">Área da equipa</h2>
            <p className="mt-3 text-sm leading-6 text-[#5e7366]">
              O funcionário entra com o seu próprio acesso e consulta a agenda
              do negócio. Não vê os clientes e os emails privados de outras barbearias.
            </p>
            <a href={centralUrl("/admin/" + shop.slug + "/barbeiro")}
              className="mt-5 inline-block rounded-lg border border-[#9bbda8] px-4 py-3 text-sm font-bold text-[#205137]">
              Abrir agenda da equipa
            </a>
          </section>
        </div>
        <p className="mt-6 text-center text-xs leading-6 text-[#688071]">
          Os pagamentos e o envio real de confirmações permanecem desativados no piloto.
          A ligação ao Gmail exige autorização do responsável pela barbearia.
        </p>
      </div>
    </main>
  )
}
