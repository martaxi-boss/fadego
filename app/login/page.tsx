import LoginForm from "@/app/login/login-form"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-lg font-black text-teal-300">F</span>
          <p className="text-lg font-black tracking-tight text-slate-950">FADEGO</p>
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Acesso reservado</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Entrar na plataforma</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Utiliza as credenciais administrativas fornecidas pela tua organização.
        </p>
        <div className="mt-7"><LoginForm /></div>
        <p className="mt-7 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">
          O acesso administrativo é reservado a identidades autorizadas.
        </p>
      </section>
    </main>
  )
}
