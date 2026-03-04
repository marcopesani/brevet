import {
  issueApiKeyRequestSchema,
  issueApiKeyResponseSchema,
  listApiKeysResponseSchema,
  revokeApiKeyResponseSchema
} from '@repo/auth-contracts/apiKeys'
import { logEventNames } from '@repo/auth-contracts/logging'
import { apiKeys } from '@repo/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { FastifyPluginAsync } from 'fastify'
import { logSecurityEvent } from '../../lib/security-log'
import { SESSION_COOKIE_NAME } from '../../plugins/auth'

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as any
  const andAny = and as any
  const eqAny = eq as any
  const descAny = desc as any

  fastify.post('/', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const payload = fastify.validate(issueApiKeyRequestSchema, request.body) as { name: string }

    const material = fastify.auth.createApiKeyMaterial()
    const [created] = await db.insert(apiKeys).values({
      userId: session.id,
      name: payload.name,
      prefix: material.prefix,
      secretHash: material.secretHash
    }).returning({
      id: apiKeys.id,
      createdAt: apiKeys.createdAt
    })
    logSecurityEvent({
      request,
      eventName: logEventNames.authApiKeyIssued,
      outcome: 'success',
      userId: session.id,
      authMethod: 'api-key',
      details: {
        api_key_id: created.id
      }
    })

    return issueApiKeyResponseSchema.parse({
      id: created.id,
      key: material.key,
      prefix: material.prefix,
      createdAt: created.createdAt.toISOString()
    })
  })

  fastify.get('/', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])

    const keys = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt
    }).from(apiKeys).where(eqAny(apiKeys.userId, session.id)).orderBy(descAny(apiKeys.createdAt))

    return listApiKeysResponseSchema.parse({
      items: keys.map((item: any) => ({
        ...item,
        revokedAt: item.revokedAt ? item.revokedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString()
      }))
    })
  })

  fastify.post('/:id/revoke', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const params = request.params as { id: string }

    await db.update(apiKeys)
      .set({
        revokedAt: new Date()
      })
      .where(andAny(eqAny(apiKeys.id, params.id), eqAny(apiKeys.userId, session.id)))
    logSecurityEvent({
      request,
      eventName: logEventNames.authApiKeyRevoked,
      outcome: 'success',
      userId: session.id,
      authMethod: 'api-key',
      details: {
        api_key_id: params.id
      }
    })

    return revokeApiKeyResponseSchema.parse({ ok: true })
  })
}

export default apiKeyRoutes
