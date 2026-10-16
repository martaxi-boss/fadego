import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Check, Scissors } from "lucide-react"
import LoginForm from "@/app/login/login-form"

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d2923] px-5 py-10 sm:px-8 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-40 size-[540px] rounded-full bg-[#95cc9f]/10 blur-3xl" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
        <section className="relative hidden min-h-[600px] overflow-hidden rounded-[2.3rem] bg-[#214036] lg:flex lg:flex-col">
          <Image src="/fadego-atelier.svg" alt="" width={960} height={1120} className="absolute inset-0 h-full w-full object-cover opacity-85" priority />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#09281f] via-[#0e2b23]/35 to-transparent" />
          <div className="relative mt-auto p-10 text-white">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#0d3529]/40 px-4 py-2 text-xs font-bold backdrop-blur">
              <Scissors className="size-4 text-[#bce5b8]" aria-hidden="true" /> Feito para barbearias
            </span>
            <h2 className="mt-6 max-w-md text-4xl font-black leading-tight tracking-[-0.05em]">
              A tua rotina,<br /><span className="font-serif font-normal italic text-[#bce5b8]">mais leve.</span>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-[#dce8dc]">
              Acede à agenda, equipa e clientes da tua barbearia num só lugar.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[480px] rounded-[2rem] bg-[#fdfdf9] p-7 shadow-[0_24px_90px_rgba(0,0,0,.23)] sm:p-10">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[#557464] transition hover:text-[#153f31]">
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao início
          </Link>
          <div className="mt-9 flex items-center gap-3">
            <Image src="/fadego-mark.svg" alt="" width={49} height={49} className="size-12 rounded-xl" />
            <div>
              <p className="text-xl font-black leading-none tracking-[-0.06em] text-[#16382d]">FADEGO</p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#64806f]">Barbearia em movimento</p>
            </div>
          </div>
          <p className="mt-10 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#3b8568]">Área reservada</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#183b2e] sm:text-4xl">Entrar na plataforma</h1>
          <p className="mt-4 text-sm leading-7 text-[#667e70]">
            Utiliza as credenciais administrativas fornecidas pela tua organização.
          </p>
          <div className="mt-7"><LoginForm /></div>
          <div className="mt-9 flex items-start gap-2 border-t border-[#e7ece7] pt-5 text-xs leading-6 text-[#748679]">
            <Check className="mt-1 size-3.5 shrink-0 text-[#418a6d]" aria-hidden="true" />
            O acesso administrativo é reservado a identidades autorizadas.
          </div>
        </section>
      </div>
    </main>
  )
}
