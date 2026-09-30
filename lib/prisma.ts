import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import { Pool } from "pg"

type DatabaseGlobals = {
  fadegoPool?: Pool
  fadegoPrisma?: PrismaClient
}

const databaseGlobals = globalThis as unknown as DatabaseGlobals

const connectionString = () => {
  const value = process.env.DATABASE_URL
  if (!value) {
    throw new Error("DATABASE_URL is not configured.")
  }
  return value
}

export const getPool = () => {
  if (!databaseGlobals.fadegoPool) {
    databaseGlobals.fadegoPool = new Pool({
      connectionString: connectionString(),
    })
  }

  return databaseGlobals.fadegoPool
}

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg(getPool()),
  })

export const db =
  databaseGlobals.fadegoPrisma ?? (databaseGlobals.fadegoPrisma = createPrismaClient())
