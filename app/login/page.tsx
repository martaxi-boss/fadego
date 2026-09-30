import LoginForm from "@/app/login/login-form"

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.18em] text-gray-500">
          FADEGO
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Acesso administrativo</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Utilize as credenciais administrativas fornecidas pela sua
          organização.
        </p>
        <LoginForm />
      </section>
    </main>
  )
}
