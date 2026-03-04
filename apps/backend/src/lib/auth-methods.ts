import { authMethods, passkeyCredentials } from '@repo/db/schema'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

export const getUserMethods = async (fastify: FastifyInstance, userId: string) => {
  const db = fastify.db as any
  const eqAny = eq as any
  const methods = await db
    .select({
      id: authMethods.id,
      type: authMethods.type,
      externalId: authMethods.externalId,
      label: authMethods.label,
      createdAt: authMethods.createdAt
    })
    .from(authMethods)
    .where(eqAny(authMethods.userId, userId))

  return methods.map((method: any) => ({
    id: method.id,
    type: method.type,
    label: method.label,
    createdAt: method.createdAt.toISOString(),
    externalId: method.externalId
  }))
}

export const countUserMethods = async (fastify: FastifyInstance, userId: string) => {
  const db = fastify.db as any
  const eqAny = eq as any
  const methods = await db
    .select({
      id: authMethods.id
    })
    .from(authMethods)
    .where(eqAny(authMethods.userId, userId))
  return methods.length
}

export const removeMethodById = async (fastify: FastifyInstance, methodId: string) => {
  const db = fastify.db as any
  const eqAny = eq as any
  await db.delete(passkeyCredentials).where(eqAny(passkeyCredentials.authMethodId, methodId))
  await db.delete(authMethods).where(eqAny(authMethods.id, methodId))
}
