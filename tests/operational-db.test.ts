import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import {
  createChairConfiguration,
  OperationalConfigError,
  saveOpeningHourConfiguration,
  updateChairConfiguration,
  updateServiceConfiguration,
  updateStaffMember,
} from "../lib/operational-config"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []
const createdUserIds: string[] = []

const createShop = async (tag: string) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Test ${tag}`,
      slug: `test-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
    },
  })
  createdShopIds.push(shop.id)
  return shop
}

const expectOperationalCode = async (
  action: () => Promise<unknown>,
  code: "NOT_FOUND" | "INVALID_ASSIGNMENT",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof OperationalConfigError)
    assert.equal(error.code, code)
    return true
  })
}

after(async () => {
  if (createdShopIds.length > 0) {
    await db.chair.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.openingHour.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.service.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.staffMember.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.barbershopMember.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.barbershop.deleteMany({
      where: { id: { in: createdShopIds } },
    })
  }

  if (createdUserIds.length > 0) {
    await db.user.deleteMany({
      where: { id: { in: createdUserIds } },
    })
  }

  await db.$disconnect()
  await getPool().end()
})

test("Chair number below 1 is rejected by PostgreSQL", async () => {
  const shop = await createShop("chair-low")

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 0,
        mode: "WALK_IN",
      },
    }),
  )
})

test("Chair number above 5 is rejected by PostgreSQL", async () => {
  const shop = await createShop("chair-high")

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 6,
        mode: "WALK_IN",
      },
    }),
  )
})

test("a tenant cannot obtain a sixth canonical chair", async () => {
  const shop = await createShop("chair-sixth")

  for (const number of [1, 2, 3, 4, 5]) {
    await db.chair.create({
      data: {
        barbershopId: shop.id,
        number,
        mode: "WALK_IN",
      },
    })
  }

  assert.equal(
    await db.chair.count({ where: { barbershopId: shop.id } }),
    5,
  )

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 6,
        mode: "WALK_IN",
      },
    }),
  )
})

test("duplicate Chair number inside one tenant is rejected", async () => {
  const shop = await createShop("chair-duplicate")

  await db.chair.create({
    data: {
      barbershopId: shop.id,
      number: 1,
      mode: "WALK_IN",
    },
  })

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 1,
        mode: "GENERAL_BOOKING",
      },
    }),
  )
})

test("different tenants may independently use Chair numbers 1 through 5", async () => {
  const first = await createShop("chair-range-a")
  const second = await createShop("chair-range-b")

  for (const barbershopId of [first.id, second.id]) {
    for (const number of [1, 2, 3, 4, 5]) {
      await db.chair.create({
        data: {
          barbershopId,
          number,
          mode: "WALK_IN",
        },
      })
    }
  }

  assert.equal(
    await db.chair.count({
      where: { barbershopId: { in: [first.id, second.id] } },
    }),
    10,
  )
})

test("cross-tenant Chair to StaffMember association is rejected by PostgreSQL", async () => {
  const first = await createShop("cross-chair-a")
  const second = await createShop("cross-chair-b")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: second.id,
      name: "Other tenant professional",
    },
  })

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: first.id,
        number: 1,
        mode: "STAFF_BOOKING",
        staffMemberId: staff.id,
      },
    }),
  )
})

test("STAFF_BOOKING without professional is rejected by PostgreSQL", async () => {
  const shop = await createShop("staff-mode-empty")

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 1,
        mode: "STAFF_BOOKING",
      },
    }),
  )
})

test("GENERAL_BOOKING with professional is rejected by PostgreSQL", async () => {
  const shop = await createShop("general-with-staff")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "General staff",
    },
  })

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 1,
        mode: "GENERAL_BOOKING",
        staffMemberId: staff.id,
      },
    }),
  )
})

test("WALK_IN with professional is rejected by PostgreSQL", async () => {
  const shop = await createShop("walk-with-staff")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "Walk staff",
    },
  })

  await assert.rejects(() =>
    db.chair.create({
      data: {
        barbershopId: shop.id,
        number: 1,
        mode: "WALK_IN",
        staffMemberId: staff.id,
      },
    }),
  )
})

test("inactive and archived staff cannot be newly assigned to STAFF_BOOKING", async () => {
  const shop = await createShop("inactive-assignment")
  const inactive = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "Inactive",
      active: false,
    },
  })
  const archived = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "Archived",
      active: false,
      archivedAt: new Date(),
    },
  })

  await expectOperationalCode(
    () =>
      createChairConfiguration(shop.id, {
        number: 1,
        name: null,
        mode: "STAFF_BOOKING",
        staffMemberId: inactive.id,
        active: true,
      }),
    "INVALID_ASSIGNMENT",
  )

  await expectOperationalCode(
    () =>
      createChairConfiguration(shop.id, {
        number: 2,
        name: null,
        mode: "STAFF_BOOKING",
        staffMemberId: archived.id,
        active: true,
      }),
    "INVALID_ASSIGNMENT",
  )
})

test("StaffMember deactivation preserves the record", async () => {
  const shop = await createShop("staff-deactivate")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "Persistent professional",
    },
  })

  await updateStaffMember(shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const persisted = await db.staffMember.findUnique({
    where: {
      id_barbershopId: {
        id: staff.id,
        barbershopId: shop.id,
      },
    },
  })

  assert.ok(persisted)
  assert.equal(persisted.active, false)
  assert.equal(persisted.archivedAt, null)
})

test("StaffMember deactivation preserves existing Chair configuration", async () => {
  const shop = await createShop("staff-chair-preserve")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "Assigned professional",
    },
  })
  const chair = await db.chair.create({
    data: {
      barbershopId: shop.id,
      number: 1,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
    },
  })

  await updateStaffMember(shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const preserved = await db.chair.findUnique({ where: { id: chair.id } })
  assert.ok(preserved)
  assert.equal(preserved.staffMemberId, staff.id)
  assert.equal(preserved.mode, "STAFF_BOOKING")
})

test("cross-tenant StaffMember update is rejected", async () => {
  const first = await createShop("staff-update-a")
  const second = await createShop("staff-update-b")
  const staff = await db.staffMember.create({
    data: {
      barbershopId: first.id,
      name: "Scoped professional",
    },
  })

  await expectOperationalCode(
    () =>
      updateStaffMember(second.id, staff.id, {
        name: "Attempted cross update",
        photoUrl: null,
        active: true,
        archived: false,
      }),
    "NOT_FOUND",
  )
})

test("cross-tenant Chair update is rejected", async () => {
  const first = await createShop("chair-update-a")
  const second = await createShop("chair-update-b")
  const chair = await db.chair.create({
    data: {
      barbershopId: first.id,
      number: 1,
      mode: "WALK_IN",
    },
  })

  await expectOperationalCode(
    () =>
      updateChairConfiguration(second.id, chair.id, {
        number: 1,
        name: null,
        mode: "WALK_IN",
        staffMemberId: null,
        active: true,
      }),
    "NOT_FOUND",
  )
})

test("cross-tenant Service update is rejected", async () => {
  const first = await createShop("service-update-a")
  const second = await createShop("service-update-b")
  const service = await db.service.create({
    data: {
      barbershopId: first.id,
      name: "Scoped service",
      price: "10.00",
      durationMinutes: 15,
    },
  })

  await expectOperationalCode(
    () =>
      updateServiceConfiguration(second.id, service.id, {
        name: "Attempted cross update",
        description: null,
        price: "10.00",
        durationMinutes: 15,
        active: true,
      }),
    "NOT_FOUND",
  )
})

test("cross-tenant OpeningHour update is rejected", async () => {
  const first = await createShop("hours-update-a")
  const second = await createShop("hours-update-b")
  const openingHour = await db.openingHour.create({
    data: {
      barbershopId: first.id,
      weekday: 0,
      isClosed: false,
      opensAt: 540,
      closesAt: 1080,
    },
  })

  await expectOperationalCode(
    () =>
      saveOpeningHourConfiguration(second.id, openingHour.id, {
        weekday: 0,
        isClosed: false,
        opensAt: 600,
        closesAt: 1080,
      }),
    "NOT_FOUND",
  )
})

test("Service negative price is rejected by PostgreSQL", async () => {
  const shop = await createShop("service-negative")

  await assert.rejects(() =>
    db.service.create({
      data: {
        barbershopId: shop.id,
        name: "Invalid price",
        price: "-0.01",
        durationMinutes: 15,
      },
    }),
  )
})

test("Service duration outside the 15-minute grid is rejected by PostgreSQL", async () => {
  const shop = await createShop("service-grid-invalid")

  await assert.rejects(() =>
    db.service.create({
      data: {
        barbershopId: shop.id,
        name: "Invalid duration",
        price: "10.00",
        durationMinutes: 20,
      },
    }),
  )
})

test("Service durations 15, 30, 45 and 60 are valid", async () => {
  const shop = await createShop("service-grid-valid")

  for (const durationMinutes of [15, 30, 45, 60]) {
    await db.service.create({
      data: {
        barbershopId: shop.id,
        name: `Service ${durationMinutes}`,
        price: "10.00",
        durationMinutes,
      },
    })
  }

  const durations = await db.service.findMany({
    where: { barbershopId: shop.id },
    select: { durationMinutes: true },
    orderBy: { durationMinutes: "asc" },
  })

  assert.deepEqual(
    durations.map((item) => item.durationMinutes),
    [15, 30, 45, 60],
  )
})

test("invalid OpeningHour weekday is rejected by PostgreSQL", async () => {
  const shop = await createShop("hours-weekday")

  await assert.rejects(() =>
    db.openingHour.create({
      data: {
        barbershopId: shop.id,
        weekday: 7,
        isClosed: true,
      },
    }),
  )
})

test("duplicate tenant weekday is rejected by PostgreSQL", async () => {
  const shop = await createShop("hours-duplicate")

  await db.openingHour.create({
    data: {
      barbershopId: shop.id,
      weekday: 1,
      isClosed: true,
    },
  })

  await assert.rejects(() =>
    db.openingHour.create({
      data: {
        barbershopId: shop.id,
        weekday: 1,
        isClosed: true,
      },
    }),
  )
})

test("invalid open and close interval is rejected by PostgreSQL", async () => {
  const shop = await createShop("hours-interval")

  await assert.rejects(() =>
    db.openingHour.create({
      data: {
        barbershopId: shop.id,
        weekday: 2,
        isClosed: false,
        opensAt: 1080,
        closesAt: 540,
      },
    }),
  )
})

test("closed OpeningHour cannot persist a fake available interval", async () => {
  const shop = await createShop("hours-closed")

  await assert.rejects(() =>
    db.openingHour.create({
      data: {
        barbershopId: shop.id,
        weekday: 3,
        isClosed: true,
        opensAt: 540,
        closesAt: 1080,
      },
    }),
  )
})

test("canonical lowercase administrative email rule is enforced by PostgreSQL", async () => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const lowercase = await db.user.create({
    data: {
      email: `admin-${suffix}@example.test`,
      passwordHash: "test-only-not-a-real-credential",
    },
  })
  createdUserIds.push(lowercase.id)

  await assert.rejects(() =>
    db.user.create({
      data: {
        email: `ADMIN-${suffix}@EXAMPLE.TEST`,
        passwordHash: "test-only-not-a-real-credential",
      },
    }),
  )
})
