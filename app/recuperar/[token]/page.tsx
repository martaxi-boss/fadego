import Image from "next/image"
import type { Metadata } from "next"
import Link from "next/link"
import ConfirmRecovery from "./confirm-recovery"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Recuperar acesso privado · FADEGO",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function RecoveryConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0d3026] px-5 py-12">
      <Link href="/" className="mb-9 inline-flex items-center gap-3 font-black text-white">
        <Image src="/fadego-mark.svg" alt="" width={46} height={46} className="size-11 rounded-xl" /> FADEGO
      </Link>
      <ConfirmRecovery token={token} />
    </main>
  )
}
