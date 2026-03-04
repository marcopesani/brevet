import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { apiKeys, sessions, users } from '@repo/db/schema'
import { backendEnv } from '../lib/env'

const SESSION_COOKIE_NAME = 'brevet_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const IS_PRODUCTION = backendEnv.isProduction
const COOKIE_SECRET = backendEnv.cookieSecret

type SessionUser = {
  id: string
  username: string | null
}

type SessionResult = {
  user: SessionUser
  tokenHash: string
} | null

type AuthUtilities = {
  createSession: (userId: string) => Promise<string>
  getSessionUser: (sessionToken?: string | null) => Promise<SessionResult>
  requireSessionUser: (sessionToken?: string | null) => Promise<SessionUser>
  clearSession: (sessionToken?: string | null) => Promise<void>
  hashSecret: (value: string) => string
  createApiKeyMaterial: () => { key: string, prefix: string, secretHash: string }
  resolveApiKeyUserId: (authorizationHeader?: string | null, xApiKeyHeader?: string | null) => Promise<string | null>
}

declare module 'fastify' {
  export interface FastifyInstance {
    auth: AuthUtilities
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const createApiKeyMaterial = () => {
  const prefix = randomBytes(4).toString('hex')
  const secret = randomBytes(24).toString('base64url')
  const key = `brv_${prefix}.${secret}`
  const secretHash = sha256(key)
  return { key, prefix, secretHash }
}

const parseApiKeyFromHeaders = (authorizationHeader?: string | null, xApiKeyHeader?: string | null) => {
  if (xApiKeyHeader && xApiKeyHeader.trim().length > 0) {
    return xApiKeyHeader.trim()
  }

  if (!authorizationHeader) {
    return null
  }
  const [scheme, value] = authorizationHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null
  }
  return value
}

export default fp(async (fastify) => {
  const db = fastify.db as any
  const andAny = and as any
  const eqAny = eq as any
  const gtAny = gt as any
  const isNullAny = isNull as any

  await fastify.register(cookie, {
    secret: COOKIE_SECRET ?? 'dev-cookie-secret',
    hook: 'onRequest'
  })

  fastify.decorate('auth', {
    createSession: async (userId: string) => {
      const token = randomBytes(24).toString('base64url')
      const tokenHash = sha256(token)
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

      await db.insert(sessions).values({
        userId,
        tokenHash,
        expiresAt
      })

      return token
    },
    getSessionUser: async (sessionToken?: string | null) => {
      if (!sessionToken) {
        return null
      }
      const tokenHash = sha256(sessionToken)
      const now = new Date()

      const match = await db
        .select({
          id: users.id,
          username: users.username
        })
        .from(sessions)
        .innerJoin(users, eqAny(users.id, sessions.userId))
        .where(andAny(eqAny(sessions.tokenHash, tokenHash), gtAny(sessions.expiresAt, now)))
        .limit(1)

      if (match.length === 0) {
        return null
      }

      return {
        user: {
          id: match[0].id,
          username: match[0].username
        },
        tokenHash
      }
    },
    requireSessionUser: async (sessionToken?: string | null) => {
      const session = await fastify.auth.getSessionUser(sessionToken)
      if (!session) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }
      return session.user
    },
    clearSession: async (sessionToken?: string | null) => {
      if (!sessionToken) {
        return
      }
      const tokenHash = sha256(sessionToken)
      await db.delete(sessions).where(eqAny(sessions.tokenHash, tokenHash))
    },
    hashSecret: sha256,
    createApiKeyMaterial,
    resolveApiKeyUserId: async (authorizationHeader?: string | null, xApiKeyHeader?: string | null) => {
      const key = parseApiKeyFromHeaders(authorizationHeader, xApiKeyHeader)
      if (!key || !key.startsWith('brv_')) {
        return null
      }

      const keyParts = key.split('.')
      if (keyParts.length !== 2) {
        return null
      }
      const prefix = keyParts[0].replace('brv_', '')
      const keyHash = sha256(key)

      const possibleKeys = await db
        .select({
          userId: apiKeys.userId,
          secretHash: apiKeys.secretHash
        })
        .from(apiKeys)
        .where(andAny(eqAny(apiKeys.prefix, prefix), isNullAny(apiKeys.revokedAt)))

      for (const candidate of possibleKeys) {
        const a = Buffer.from(candidate.secretHash)
        const b = Buffer.from(keyHash)
        if (a.length === b.length && timingSafeEqual(a, b)) {
          return candidate.userId
        }
      }
      return null
    }
  })
}, { name: 'auth', dependencies: ['db', 'validation'] })

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, IS_PRODUCTION }
