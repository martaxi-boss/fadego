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
      contactEmail: "shop-a@example.test",
      senderAlias: "cortes", // preserve future-domain configuration during Gmail-only pilot
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
  // Historic fixtures allow actual owner-side completion and no-show flows
  // without depending on the wall clock or touching real appointments.
  for (const [index, hour] of [9, 10].entries()) {
    const customer = customers[4 + index]
    await db.booking.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        serviceId: services[0].id,
        chairId: chairs[0].id,
        staffMemberId: staffA.id,
        mode: "STAFF_BOOKING",
        startsAt: new Date(Date.UTC(2025, 4, 20, hour)),
        endsAt: new Date(Date.UTC(2025, 4, 20, hour, 30)),
        status: "CONFIRMED",
        serviceNameSnapshot: services[0].name,
        serviceDurationMinutes: services[0].durationMinutes,
        servicePriceSnapshot: services[0].price,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerEmailSnapshot: customer.email,
        staffNameSnapshot: staffA.name,
        chairNumberSnapshot: chairs[0].number,
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

  // Second synthetic tenant and a STAFF user exercise real browser access isolation.
  const staffLogin = await db.user.create({
    data: {
      name: "Colaborador Norte — Demonstração",
      email: "ci-staff-north@fadego.example",
      passwordHash: await hashPassword(password!),
      platformRole: "USER",
      active: true,
    },
  })
  const northShop = await db.barbershop.create({
    data: {
      name: "Barbearia Norte — Exemplo",
      contactEmail: "shop-b@example.test",
      slug: "barbearia-norte-demo",
      status: "ACTIVE",
      timezone: "Europe/Lisbon",
      address: "Morada fictícia do Norte",
    },
  })
  await db.barbershopMember.create({
    data: { userId: staffLogin.id, barbershopId: northShop.id, role: "STAFF" },
  })
  await db.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      barbershopId: northShop.id,
      weekday,
      isClosed: weekday === 6,
      opensAt: weekday === 6 ? null : 9 * 60,
      closesAt: weekday === 6 ? null : 19 * 60,
    })),
  })
  const northChair = await db.chair.create({
    data: { barbershopId: northShop.id, number: 1, mode: "GENERAL_BOOKING" },
  })
  const northService = await db.service.create({
    data: {
      barbershopId: northShop.id,
      name: "Corte Norte — Exemplo",
      price: "15.00", durationMinutes: 30, active: true,
    },
  })
  const northCustomer = await db.customer.create({
    data: {
      barbershopId: northShop.id,
      name: "Cliente Norte Fictício",
      phone: "+351 919 999 991",
      email: "norte@example.test",
    },
  })
  await db.booking.create({
    data: {
      barbershopId: northShop.id,
      customerId: northCustomer.id,
      serviceId: northService.id,
      chairId: northChair.id,
      mode: "GENERAL_BOOKING",
      startsAt: at(11),
      endsAt: at(11, 30),
      status: "CONFIRMED",
      serviceNameSnapshot: northService.name,
      serviceDurationMinutes: northService.durationMinutes,
      servicePriceSnapshot: northService.price,
      customerNameSnapshot: northCustomer.name,
      customerPhoneSnapshot: northCustomer.phone,
      customerEmailSnapshot: northCustomer.email,
      staffNameSnapshot: null,
      chairNumberSnapshot: northChair.number,
    },
  })
  const northPlan = await db.membershipPlan.create({
    data: {
      barbershopId: northShop.id,
      name: "Club Norte — Exemplo",
      price: "25.00",
      active: true,
    },
  })
  await db.membership.create({
    data: {
      barbershopId: northShop.id,
      customerId: northCustomer.id,
      membershipPlanId: northPlan.id,
      status: "ACTIVE",
      startedAt: new Date("2030-05-01T00:00:00.000Z"),
      currentCycleStartsAt: new Date("2030-05-01T00:00:00.000Z"),
      currentCycleEndsAt: new Date("2030-06-01T00:00:00.000Z"),
      planNameSnapshot: northPlan.name,
      planPriceSnapshot: northPlan.price,
    },
  })

  console.log("FADEGO CI showroom seeded: 2 tenants, 2 demo identities and isolated fake bookings.")
}

main().catch((e: unknown) => {
  console.error("[ci-demo-seed]", e instanceof Error ? e.message : "unknown")
  process.exitCode = 1
}).finally(async () => {
  await db.$disconnect()
  await getPool().end()
})
