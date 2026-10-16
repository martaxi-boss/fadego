/** Synthetic FADEGO showroom fixtures. Refuses to touch anything outside CI. */
import { db, getPool } from "../lib/prisma"
import { hashPassword } from "../lib/password"

const email = process.env.FADEGO_DEMO_EMAIL
const password = process.env.FADEGO_DEMO_PASSWORD
if (process.env.CI !== "true" || !email || !password || !process.env.DATABASE_URL?.includes("localhost:5432/fadego")) {
  throw new Error("Refusing screenshot seeding outside disposable CI PostgreSQL.")
}
const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 4, 20, hour, minute))

async function main() {
  const user = await db.user.create({
    data: {
      name: "Administrador — Demonstração",
      email: email!,
      passwordHash: await hashPassword(password!),
      active: true,
      platformRole: "SUPER_ADMIN",
    },
  })
  const shop = await db.barbershop.create({
    data: {
      name: "Atelier FADEGO — Demonstração",
      slug: "atelier-fadego-demo",
      status: "ACTIVE",
      timezone: "Europe/Lisbon",
      address: "Morada fictícia · Portugal",
      phone: "+351 910 000 000",
    },
  })
  await db.barbershopMember.create({
    data: { userId: user.id, barbershopId: shop.id, role: "OWNER" },
  })
  await db.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      barbershopId: shop.id,
      weekday,
      isClosed: weekday === 6,
      opensAt: weekday === 6 ? null : 9 * 60,
      closesAt: weekday === 6 ? null : 19 * 60,
    })),
  })
  const staffA = await db.staffMember.create({
    data: { barbershopId: shop.id, name: "Diogo — Exemplo", active: true },
  })
  const staffB = await db.staffMember.create({
    data: { barbershopId: shop.id, name: "Miguel — Exemplo", active: true },
  })
  const chairs = [
    await db.chair.create({
      data: { barbershopId: shop.id, number: 1, name: "Cadeira 1", mode: "STAFF_BOOKING", staffMemberId: staffA.id },
    }),
    await db.chair.create({
      data: { barbershopId: shop.id, number: 2, name: "Cadeira 2", mode: "STAFF_BOOKING", staffMemberId: staffB.id },
    }),
    await db.chair.create({
      data: { barbershopId: shop.id, number: 3, name: "Atendimento livre", mode: "GENERAL_BOOKING" },
    }),
  ]
  const services = [
    await db.service.create({
      data: { barbershopId: shop.id, name: "Corte masculino", description: "Corte personalizado e acabamento.", price: "18.00", durationMinutes: 30 },
    }),
    await db.service.create({
      data: { barbershopId: shop.id, name: "Barba e acabamento", description: "Barba, contornos e tratamento.", price: "12.00", durationMinutes: 30 },
    }),
    await db.service.create({
      data: { barbershopId: shop.id, name: "Corte + Barba", description: "Experiência completa de barbearia.", price: "28.00", durationMinutes: 45 },
    }),
  ]
  const names = [
    "João de Exemplo", "André Demonstração", "Pedro de Teste",
    "Tiago Exemplo", "Rui Demonstrativo", "Carlos de Teste",
  ]
  const customers = []
  for (const [i, name] of names.entries()) {
    customers.push(await db.customer.create({
      data: {
        barbershopId: shop.id, name,
        phone: "+351 910 000 00" + i,
        email: "cliente-" + (i + 1) + "@example.test",
      },
    }))
  }
  const appointments = [
    { customer: customers[0], service: services[0], chair: chairs[0], staff: staffA, hour: 9, status: "CONFIRMED" as const },
    { customer: customers[1], service: services[2], chair: chairs[1], staff: staffB, hour: 10, status: "NEEDS_REASSIGNMENT" as const },
    { customer: customers[2], service: services[1], chair: chairs[2], staff: null, hour: 12, status: "COMPLETED" as const },
    { customer: customers[3], service: services[0], chair: chairs[0], staff: staffA, hour: 15, status: "NO_SHOW" as const },
  ]
  for (const item of appointments) {
    await db.booking.create({
      data: {
        barbershopId: shop.id, customerId: item.customer.id,
        serviceId: item.service.id, chairId: item.chair.id,
        staffMemberId: item.staff?.id ?? null,
        mode: item.staff ? "STAFF_BOOKING" : "GENERAL_BOOKING",
        startsAt: at(item.hour),
        endsAt: at(item.hour, item.service.durationMinutes),
        status: item.status,
        serviceNameSnapshot: item.service.name,
        serviceDurationMinutes: item.service.durationMinutes,
        servicePriceSnapshot: item.service.price,
        customerNameSnapshot: item.customer.name,
        customerPhoneSnapshot: item.customer.phone,
        customerEmailSnapshot: item.customer.email,
        staffNameSnapshot: item.staff?.name ?? null,
        chairNumberSnapshot: item.chair.number,
      },
    })
  }
  const plan = await db.membershipPlan.create({
    data: {
      barbershopId: shop.id,
      name: "Club Essencial — Demonstração",
      description: "Plano fictício com serviços incluídos.",
      price: "39.90", benefits: "Benefícios fictícios de fidelização.",
      active: true,
    },
  })
  await db.membershipPlanService.create({
    data: { barbershopId: shop.id, membershipPlanId: plan.id, serviceId: services[0].id, usageLimitPerCycle: 2 },
  })
  const membership = await db.membership.create({
    data: {
      barbershopId: shop.id, membershipPlanId: plan.id, customerId: customers[0].id,
      status: "ACTIVE",
      startedAt: new Date("2030-05-01T00:00:00.000Z"),
      currentCycleStartsAt: new Date("2030-05-01T00:00:00.000Z"),
      currentCycleEndsAt: new Date("2030-06-01T00:00:00.000Z"),
      planNameSnapshot: plan.name, planPriceSnapshot: plan.price,
      planBenefitsSnapshot: plan.benefits,
    },
  })
  await db.membershipEntitlement.create({
    data: {
      barbershopId: shop.id, membershipId: membership.id,
      serviceId: services[0].id, serviceNameSnapshot: services[0].name,
      usageLimitPerCycle: 2,
    },
  })
  console.log("FADEGO CI showroom seeded: 1 tenant, 6 fake customers, 4 fake bookings.")
}

main().catch((e: unknown) => {
  console.error("[ci-demo-seed]", e instanceof Error ? e.message : "unknown")
  process.exitCode = 1
}).finally(async () => {
  await db.$disconnect()
  await getPool().end()
})
