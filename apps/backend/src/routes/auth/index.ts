import { sessionResponseSchema, whoamiResponseSchema } from '@repo/auth-contracts/auth'
import { logEventNames } from '@repo/auth-contracts/logging'
import { FastifyPluginAsync } from 'fastify'
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../plugins/auth'
import { getUserMethods } from '../../lib/auth-methods'
import { logSecurityEvent } from '../../lib/security-log'
import siwxRoutes from './siwx'
import passkeyRoutes from './passkey'
import apiKeyRoutes from './api-keys'
import methodRoutes from './methods'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(siwxRoutes, { prefix: '/siwx' })
  fastify.register(passkeyRoutes, { prefix: '/passkey' })
  fastify.register(apiKeyRoutes, { prefix: '/api-keys' })
  fastify.register(methodRoutes, { prefix: '/methods' })

  fastify.get('/session', async (request) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME]
    const session = await fastify.auth.getSessionUser(sessionToken)
    if (!session) {
      return sessionResponseSchema.parse({
        authenticated: false,
        user: null,
        methods: []
      })
    }

    const methods = await getUserMethods(fastify, session.user.id)
    return sessionResponseSchema.parse({
      authenticated: true,
      user: session.user,
      methods: methods.map(({ externalId, ...item }: any) => item)
    })
  })

  fastify.post('/logout', async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME]
    await fastify.auth.clearSession(sessionToken)
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/'
    })
    logSecurityEvent({
      request,
      eventName: logEventNames.authSessionLoggedOut,
      outcome: 'success'
    })
    return { ok: true }
  })

  fastify.get('/whoami', async (request) => {
    const apiKeyUserId = await fastify.auth.resolveApiKeyUserId(
      request.headers.authorization,
      request.headers['x-api-key'] as string | undefined
    )
    if (apiKeyUserId) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authWhoamiApiKey,
        outcome: 'success',
        userId: apiKeyUserId,
        authMethod: 'api-key'
      })
      return whoamiResponseSchema.parse({
        authenticated: true,
        via: 'api-key',
        userId: apiKeyUserId
      })
    }

    const sessionToken = request.cookies[SESSION_COOKIE_NAME]
    const session = await fastify.auth.getSessionUser(sessionToken)
    if (!session) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authWhoamiUnauthorized,
        outcome: 'failure'
      })
      throw fastify.httpErrors.unauthorized('Authentication required')
    }
    logSecurityEvent({
      request,
      eventName: logEventNames.authWhoamiSession,
      outcome: 'success',
      userId: session.user.id,
      authMethod: 'session'
    })
    return whoamiResponseSchema.parse({
      authenticated: true,
      via: 'session',
      userId: session.user.id
    })
  })

  fastify.get('/health', async () => ({ ok: true, maxSessionAgeSeconds: SESSION_MAX_AGE_SECONDS }))
}

export default authRoutes
