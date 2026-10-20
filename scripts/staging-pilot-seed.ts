/**
 * Internal, synthetic FADEGO tenant on the dedicated staging database only.
 * Not executed by CI, deploy, the public website, or a web request.
 * Requires explicit approval, release-local execution and email-send guards.
 */
import { realpathSync } from "node:fs"
import { db, getPool } from "../lib/prisma"
import { assertStagingPilotEnvironment } from "../lib/staging-pilot-policy"

const PILOT_SLUG = "fadego-piloto-interno"
const ADMIN_EMAIL = "pilot-admin@fadego.invalid"

async function seedPilot() {
  assertStagingPilotEnvironment(process.env, realpathSync(process.cwd()))
  const result = await db.$transaction(async (tx) => {
    const prior = await tx.barbershop.findUnique({
      where: { slug: PILOT_SLUG }, select: { id: true },
    })
    if (prior) throw new Error("PILOT_SEED_REFUSED_EXISTING_TENANT")

    const admin = await tx.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: { id: true, active: true, platformRole: true },
    })
    if (!admin?.active || admin.platformRole !== "SUPER_ADMIN") {
      throw new Error("PILOT_SEED_REFUSED_NO_EXISTING_ADMIN")
    }

    const shop = await tx.barbershop.create({
      data: {
        name: "Barbearia Piloto FADEGO — Demonstração Fictícia",
        slug: PILOT_SLUG,
        status: "SUSPENDED",
        timezone: "Europe/Lisbon",
        address: "Morada fictícia — ambiente de testes",
        phone: "+351 910 000 000",
        contactEmail: "piloto-ficticio@example.test",
      },
    })
    await tx.barbershopMember.create({
      data: {
        userId: admin.id, barbershopId: shop.id,
        role: "OWNER", active: true,
      },
    })
    await tx.openingHour.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        barbershopId: shop.id, weekday,
        isClosed: weekday === 0,
        opensAt: weekday === 0 ? null : 9 * 60,
        closesAt: weekday === 0 ? null : 19 * 60,
      })),
    })
    const [firstStaff, secondStaff] = await Promise.all([
      tx.staffMember.create({ data: {
        barbershopId: shop.id, name: "Diogo — Profissional Fictício",
      } }),
      tx.staffMember.create({ data: {
        barbershopId: shop.id, name: "Miguel — Profissional Fictício",
      } }),
    ])
    const chairs = []
    chairs.push(await tx.chair.create({
      data: {
        barbershopId: shop.id, number: 1,
        name: "Cadeira 1", mode: "STAFF_BOOKING", staffMemberId: firstStaff.id,
      },
    }))
    chairs.push(await tx.chair.create({
      data: {
        barbershopId: shop.id, number: 2,
        name: "Cadeira 2", mode: "STAFF_BOOKING", staffMemberId: secondStaff.id,
      },
    }))
    chairs.push(await tx.chair.create({
      data: {
        barbershopId: shop.id, number: 3,
        name: "Atendimento geral", mode: "GENERAL_BOOKING",
      },
    }))
    const haircut = await tx.service.create({
      data: {
        barbershopId: shop.id, name: "Corte masculino — Demonstração",
        price: "18.00", durationMinutes: 30,
      },
    })
    const beard = await tx.service.create({
      data: {
        barbershopId: shop.id, name: "Barba — Demonstração",
        price: "12.00", durationMinutes: 30,
      },
    })
    await tx.service.create({
      data: {
        barbershopId: shop.id, name: "Corte + barba — Demonstração",
        price: "28.00", durationMinutes: 45,
      },
    })
    const customer = await tx.customer.create({
      data: {
        barbershopId: shop.id, name: "João — Cliente Fictício",
        phone: "+351 910 000 001", email: "cliente-ficticio@example.test",
      },
    })
    await tx.booking.create({
      data: {
        barbershopId: shop.id, customerId: customer.id,
        serviceId: haircut.id, chairId: chairs[0].id,
        staffMemberId: firstStaff.id, mode: "STAFF_BOOKING",
        startsAt: new Date("2030-05-20T09:00:00.000Z"),
        endsAt: new Date("2030-05-20T09:30:00.000Z"),
        serviceNameSnapshot: haircut.name,
        serviceDurationMinutes: haircut.durationMinutes,
        servicePriceSnapshot: haircut.price,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerEmailSnapshot: customer.email,
        staffNameSnapshot: firstStaff.name,
        chairNumberSnapshot: chairs[0].number,
      },
    })
    const secondCustomer = await tx.customer.create({
      data: {
        barbershopId: shop.id, name: "Rui — Cliente de Testes",
        phone: "+351 910 000 002", email: "outro-ficticio@example.test",
      },
    })
    await tx.booking.create({
      data: {
        barbershopId: shop.id, customerId: secondCustomer.id,
        serviceId: beard.id, chairId: chairs[2].id,
        mode: "GENERAL_BOOKING",
        startsAt: new Date("2030-05-20T10:00:00.000Z"),
        endsAt: new Date("2030-05-20T10:30:00.000Z"),
        serviceNameSnapshot: beard.name,
        serviceDurationMinutes: beard.durationMinutes,
        servicePriceSnapshot: beard.price,
        customerNameSnapshot: secondCustomer.name,
        customerPhoneSnapshot: secondCustomer.phone,
        customerEmailSnapshot: secondCustomer.email,
        staffNameSnapshot: null,
        chairNumberSnapshot: chairs[2].number,
      },
    })
    const plan = await tx.membershipPlan.create({
      data: {
        barbershopId: shop.id,
        name: "Club Essencial — Apenas Demonstração",
        description: "Plano fictício. Sem cobrança real.",
        price: "39.90",
        benefits: "Serviços de exemplo sem pagamentos.",
      },
    })
    await tx.membershipPlanService.create({
      data: {
        barbershopId: shop.id,
        membershipPlanId: plan.id, serviceId: haircut.id,
        usageLimitPerCycle: 2,
      },
    })
    return { slug: shop.slug, status: shop.status }
  })
  console.log("FADEGO_SYNTHETIC_STAGING_PILOT=PREPARED")
  console.log("FADEGO_PILOT_SLUG=" + result.slug)
  console.log("FADEGO_PILOT_STATUS=" + result.status)
  console.log("FADEGO_PILOT_GMAIL_AND_BILLING=DISABLED")
}

seedPilot()
  .catch((error: unknown) => {
    console.error(
      "[staging-pilot] Refused:",
      error instanceof Error ? error.message : "Unknown failure",
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
    await getPool().end()
  })
