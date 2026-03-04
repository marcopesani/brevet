import { randomBytes } from 'node:crypto'
import { logEventNames } from '@repo/auth-contracts/logging'
import {
  siwxChallengeRequestSchema,
  siwxChallengeResponseSchema,
  siwxUnlinkRequestSchema,
  siwxVerifyRequestSchema,
  siwxVerifyResponseSchema
} from '@repo/auth-contracts/siwx'
import { authMethods, siwxNonces, users } from '@repo/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { FastifyPluginAsync } from 'fastify'
import { SiweMessage } from 'siwe'
import { IS_PRODUCTION, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../plugins/auth'
import { countUserMethods, removeMethodById } from '../../lib/auth-methods'
import { backendEnv } from '../../lib/env'
import { logSecurityEvent } from '../../lib/security-log'

const createCaip10 = (chainId: number, address: string) => `eip155:${chainId}:${address.toLowerCase()}`

const siwxRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as any
  const andAny = and as any
  const eqAny = eq as any
  const gtAny = gt as any

  const sessionCookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: IS_PRODUCTION,
    maxAge: SESSION_MAX_AGE_SECONDS
  }

  fastify.post('/challenge', async (request) => {
    const payload = fastify.validate(siwxChallengeRequestSchema, request.body) as {
      address: string
      chainId: number
      intent: 'signin' | 'link'
    }
    const currentSession = await fastify.auth.getSessionUser(request.cookies[SESSION_COOKIE_NAME])
    if (payload.intent === 'link' && !currentSession) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodLinked,
        outcome: 'failure',
        authMethod: 'wallet',
        details: {
          reason: 'missing_session',
          intent: payload.intent
        }
      })
      throw fastify.httpErrors.unauthorized('Must be authenticated to link a wallet')
    }

    const nonce = randomBytes(12).toString('hex')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
    const domain = backendEnv.siwxDomain
    const uri = backendEnv.siwxUri

    const message = new SiweMessage({
      domain,
      address: payload.address,
      statement: 'Sign in to Brevet via SIWX',
      uri,
      version: '1',
      chainId: payload.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: expiresAt.toISOString()
    }).prepareMessage()

    await db.insert(siwxNonces).values({
      nonce,
      address: payload.address.toLowerCase(),
      chainId: payload.chainId,
      purpose: payload.intent,
      userId: payload.intent === 'link' ? currentSession?.user.id : null,
      expiresAt
    })

    return siwxChallengeResponseSchema.parse({
      nonce,
      message,
      expiresAt: expiresAt.toISOString()
    })
  })

  fastify.post('/verify', async (request, reply) => {
    const payload = fastify.validate(siwxVerifyRequestSchema, request.body) as {
      address: string
      chainId: number
      message: string
      signature: string
      intent: 'signin' | 'link'
    }
    const domain = backendEnv.siwxDomain
    const siwe = new SiweMessage(payload.message)
    const verification = await siwe.verify({
      signature: payload.signature,
      domain
    })

    if (!verification.success) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'wallet',
        details: {
          reason: 'invalid_signature',
          intent: payload.intent,
          chain_id: payload.chainId
        }
      })
      throw fastify.httpErrors.unauthorized('Invalid wallet signature')
    }

    const caip10 = createCaip10(payload.chainId, payload.address)
    const linkSessionUserId = payload.intent === 'link'
      ? (await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])).id
      : undefined
    const userId = await db.transaction(async (tx: any) => {
      const nonceMatch = await tx
        .select({
          id: siwxNonces.id,
          userId: siwxNonces.userId
        })
        .from(siwxNonces)
        .where(andAny(
          eqAny(siwxNonces.nonce, siwe.nonce),
          eqAny(siwxNonces.address, payload.address.toLowerCase()),
          eqAny(siwxNonces.chainId, payload.chainId),
          eqAny(siwxNonces.purpose, payload.intent),
          eqAny(siwxNonces.used, false),
          gtAny(siwxNonces.expiresAt, new Date())
        ))
        .limit(1)

      if (nonceMatch.length === 0) {
        logSecurityEvent({
          request,
          eventName: logEventNames.authLoginFailed,
          outcome: 'failure',
          authMethod: 'wallet',
          details: {
            reason: 'nonce_invalid_or_expired',
            intent: payload.intent,
            chain_id: payload.chainId
          }
        })
        throw fastify.httpErrors.unauthorized('Nonce invalid or expired')
      }
      if (payload.intent === 'link' && nonceMatch[0].userId !== linkSessionUserId) {
        logSecurityEvent({
          request,
          eventName: logEventNames.authMethodLinked,
          outcome: 'failure',
          authMethod: 'wallet',
          details: {
            reason: 'nonce_owner_mismatch',
            intent: payload.intent,
            chain_id: payload.chainId
          }
        })
        throw fastify.httpErrors.unauthorized('Nonce owner mismatch for wallet linking')
      }

      const used = await tx
        .update(siwxNonces)
        .set({ used: true })
        .where(andAny(eqAny(siwxNonces.id, nonceMatch[0].id), eqAny(siwxNonces.used, false)))
        .returning({ id: siwxNonces.id })

      if (used.length === 0) {
        logSecurityEvent({
          request,
          eventName: logEventNames.authLoginFailed,
          outcome: 'failure',
          authMethod: 'wallet',
          details: {
            reason: 'nonce_already_consumed',
            intent: payload.intent,
            chain_id: payload.chainId
          }
        })
        throw fastify.httpErrors.unauthorized('Nonce already consumed')
      }

      if (payload.intent === 'signin') {
        const existing = await tx.select({
          userId: authMethods.userId
        }).from(authMethods).where(andAny(
          eqAny(authMethods.type, 'wallet'),
          eqAny(authMethods.externalId, caip10)
        )).limit(1)

        if (existing.length > 0) {
          return existing[0].userId
        }

        const [user] = await tx.insert(users).values({}).returning({ id: users.id })
        await tx.insert(authMethods).values({
          userId: user.id,
          type: 'wallet',
          externalId: caip10,
          label: `${payload.address.slice(0, 6)}...${payload.address.slice(-4)}`
        })
        return user.id
      }

      if (!linkSessionUserId) {
        throw fastify.httpErrors.unauthorized('Authentication required for linking')
      }
      await tx.insert(authMethods).values({
        userId: linkSessionUserId,
        type: 'wallet',
        externalId: caip10,
        label: `${payload.address.slice(0, 6)}...${payload.address.slice(-4)}`
      }).onConflictDoNothing()
      return linkSessionUserId
    })

    const sessionToken = await fastify.auth.createSession(userId)
    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions)
    logSecurityEvent({
      request,
      eventName: payload.intent === 'signin'
        ? logEventNames.authLoginSucceeded
        : logEventNames.authMethodLinked,
      outcome: 'success',
      authMethod: 'wallet',
      userId,
      details: {
        intent: payload.intent,
        chain_id: payload.chainId
      }
    })

    return siwxVerifyResponseSchema.parse({
      ok: true,
      userId
    })
  })

  fastify.post('/unlink', async (request) => {
    const session = await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const body = fastify.validate(siwxUnlinkRequestSchema, request.body) as { address: string, chainId: number }
    const caip10 = createCaip10(body.chainId, body.address)

    const methodsCount = await countUserMethods(fastify, session.id)
    if (methodsCount <= 1) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodUnlinked,
        outcome: 'failure',
        authMethod: 'wallet',
        userId: session.id,
        details: {
          reason: 'last_method_guard'
        }
      })
      throw fastify.httpErrors.badRequest('Cannot remove the last login method')
    }

    const method = await db.select({
      id: authMethods.id
    }).from(authMethods).where(andAny(
      eqAny(authMethods.userId, session.id),
      eqAny(authMethods.type, 'wallet'),
      eqAny(authMethods.externalId, caip10)
    )).limit(1)

    if (method.length === 0) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodUnlinked,
        outcome: 'failure',
        authMethod: 'wallet',
        userId: session.id,
        details: {
          reason: 'method_not_found',
          chain_id: body.chainId
        }
      })
      throw fastify.httpErrors.notFound('Wallet method not found')
    }

    await removeMethodById(fastify, method[0].id)
    logSecurityEvent({
      request,
      eventName: logEventNames.authMethodUnlinked,
      outcome: 'success',
      authMethod: 'wallet',
      userId: session.id,
      details: {
        method_id: method[0].id,
        chain_id: body.chainId
      }
    })
    return { ok: true }
  })
}

export default siwxRoutes
