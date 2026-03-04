import { unlinkMethodRequestSchema } from '@repo/auth-contracts/auth'
import { logEventNames } from '@repo/auth-contracts/logging'
import { authMethods } from '@repo/db/schema'
import { and, eq } from 'drizzle-orm'
import { FastifyPluginAsync } from 'fastify'
import { getUserMethods, removeMethodById } from '../../lib/auth-methods'
import { logSecurityEvent } from '../../lib/security-log'
import { SESSION_COOKIE_NAME } from '../../plugins/auth'

const methodRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as any
  const andAny = and as any
  const eqAny = eq as any

  fastify.get('/', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const methods = await getUserMethods(fastify, session.id)
    return {
      items: methods.map(({ externalId, ...item }: any) => item)
    }
  })

  fastify.post('/unlink', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const payload = fastify.validate(unlinkMethodRequestSchema, request.body) as { methodId: string }

    const methods = await getUserMethods(fastify, session.id)
    if (methods.length <= 1) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodUnlinked,
        outcome: 'failure',
        userId: session.id,
        details: {
          reason: 'last_method_guard'
        }
      })
      throw fastify.httpErrors.badRequest('Cannot remove the last login method')
    }

    const targetMethod = await db.select({
      id: authMethods.id
    }).from(authMethods).where(andAny(
      eqAny(authMethods.id, payload.methodId),
      eqAny(authMethods.userId, session.id)
    )).limit(1)

    if (targetMethod.length === 0) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodUnlinked,
        outcome: 'failure',
        userId: session.id,
        details: {
          reason: 'method_not_found',
          method_id: payload.methodId
        }
      })
      throw fastify.httpErrors.notFound('Method not found')
    }

    await removeMethodById(fastify, payload.methodId)
    logSecurityEvent({
      request,
      eventName: logEventNames.authMethodUnlinked,
      outcome: 'success',
      userId: session.id,
      details: {
        method_id: payload.methodId
      }
    })
    return { ok: true }
  })
}

export default methodRoutes
