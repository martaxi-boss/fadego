import Image from "next/image"
import Link from "next/link"
import BookingRecoveryForm from "./recovery-form"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Recuperar marcação · FADEGO",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
}

export default async function RecoveryRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main className="min-h-screen bg-[#f6f8f3] px-5 py-8 text-[#172e23]">
      <header className="mx-auto mb-10 flex max-w-3xl items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2.5 font-black tracking-[-0.06em] text-[#173d2d]">
          <Image src="/fadego-mark.svg" alt="" width={38} height={38} className="size-9 rounded-xl" /> FADEGO
        </Link>
      </header>
      <BookingRecoveryForm slug={slug} />
    </main>
  )
}
