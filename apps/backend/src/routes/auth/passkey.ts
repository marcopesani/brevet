import { randomUUID } from 'node:crypto'
import { FastifyPluginAsync } from 'fastify'
import { logEventNames } from '@repo/auth-contracts/logging'
import {
  passkeyLoginVerifyRequestSchema,
  passkeyRegisterOptionsRequestSchema,
  passkeyRegisterVerifyRequestSchema,
  passkeyVerifyResponseSchema
} from '@repo/auth-contracts/passkey'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON
} from '@simplewebauthn/server'
import { and, eq } from 'drizzle-orm'
import { authMethods, passkeyCredentials, users } from '@repo/db/schema'
import { IS_PRODUCTION, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../plugins/auth'
import { backendEnv } from '../../lib/env'
import { logSecurityEvent } from '../../lib/security-log'

const PASSKEY_REG_COOKIE = 'brevet_passkey_reg'
const PASSKEY_AUTH_COOKIE = 'brevet_passkey_auth'

type PasskeyRegisterBody = {
  username?: string
  intent?: 'signup' | 'link'
}

const rpid = backendEnv.passkeyRpId
const rpName = backendEnv.passkeyRpName
const origin = backendEnv.frontendOrigin
const allowedOrigins = [origin]

const passkeyRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as any
  const andAny = and as any
  const eqAny = eq as any

  const sessionCookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: IS_PRODUCTION,
    maxAge: SESSION_MAX_AGE_SECONDS
  }
  const shortLivedCookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: IS_PRODUCTION,
    maxAge: 300
  }

  const parseContextCookie = <T>(value?: string): T => {
    if (!value) {
      throw fastify.httpErrors.badRequest('Missing passkey context')
    }

    try {
      return JSON.parse(value) as T
    } catch {
      throw fastify.httpErrors.badRequest('Invalid passkey context')
    }
  }

  fastify.post('/register/options', async (request, reply) => {
    const body = fastify.validate(passkeyRegisterOptionsRequestSchema, request.body ?? {}) as PasskeyRegisterBody
    const intent = body.intent ?? 'signup'
    const currentSession = await fastify.auth.getSessionUser(request.cookies[SESSION_COOKIE_NAME])
    const targetUserId = intent === 'link' ? currentSession?.user.id : randomUUID()

    if (intent === 'link' && !currentSession) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authMethodLinked,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'missing_session',
          intent
        }
      })
      throw fastify.httpErrors.unauthorized('You must be logged in to link a passkey')
    }

    const options = await generateRegistrationOptions({
      rpID: rpid,
      rpName,
      userID: new TextEncoder().encode(targetUserId ?? randomUUID()),
      userName: body.username ?? `user_${Date.now()}`,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    })

    const ctx = {
      challenge: options.challenge,
      userId: targetUserId,
      username: body.username ?? null,
      intent
    }

    reply.setCookie(PASSKEY_REG_COOKIE, JSON.stringify(ctx), {
      ...shortLivedCookieOptions
    })

    return options
  })

  fastify.post('/register/verify', async (request, reply) => {
    const context = parseContextCookie<{
      challenge: string
      userId?: string
      username: string | null
      intent: 'signup' | 'link'
    }>(request.cookies[PASSKEY_REG_COOKIE])

    if (!context.userId) {
      throw fastify.httpErrors.badRequest('Registration context is invalid')
    }

    const body = fastify.validate(passkeyRegisterVerifyRequestSchema, request.body) as unknown as RegistrationResponseJSON
    let registrationVerification
    try {
      registrationVerification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: context.challenge,
        expectedOrigin: allowedOrigins,
        expectedRPID: rpid
      })
    } catch {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'register_verification_failed',
          intent: context.intent
        }
      })
      throw fastify.httpErrors.unauthorized('Passkey registration verification failed')
    }

    if (!registrationVerification.verified || !registrationVerification.registrationInfo) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'register_not_verified',
          intent: context.intent
        }
      })
      throw fastify.httpErrors.unauthorized('Passkey registration was not verified')
    }
    const credential = registrationVerification.registrationInfo.credential
    const credentialId = credential.id
    const publicKey = Buffer.from(credential.publicKey).toString('base64url')
    const transports = JSON.stringify(credential.transports ?? [])
    const counter = registrationVerification.registrationInfo.credential.counter

    const linkSessionUserId = context.intent === 'link'
      ? (await fastify.auth.requireSessionUser(request.cookies[SESSION_COOKIE_NAME])).id
      : undefined

    const userId = await db.transaction(async (tx: any) => {
      const resolvedUserId = context.intent === 'signup' ? context.userId : linkSessionUserId
      if (!resolvedUserId) {
        throw fastify.httpErrors.badRequest('Registration context is invalid')
      }

      if (context.intent === 'signup') {
        await tx.insert(users).values({
          id: resolvedUserId,
          username: context.username
        }).onConflictDoNothing()
      }

      const [method] = await tx
        .insert(authMethods)
        .values({
          userId: resolvedUserId,
          type: 'passkey',
          externalId: credentialId,
          label: 'Passkey'
        })
        .onConflictDoNothing()
        .returning({
          id: authMethods.id
        })

      const authMethodId = method?.id ?? (
        await tx.select({ id: authMethods.id }).from(authMethods).where(
          andAny(
            eqAny(authMethods.userId, resolvedUserId),
            eqAny(authMethods.type, 'passkey'),
            eqAny(authMethods.externalId, credentialId)
          )
        ).limit(1)
      )[0]?.id

      if (!authMethodId) {
        logSecurityEvent({
          request,
          eventName: logEventNames.authMethodLinked,
          outcome: 'failure',
          authMethod: 'passkey',
          userId: resolvedUserId,
          details: {
            reason: 'method_persist_failed',
            intent: context.intent
          }
        })
        throw fastify.httpErrors.internalServerError('Unable to persist passkey')
      }

      await tx.insert(passkeyCredentials).values({
        authMethodId,
        credentialId,
        publicKey,
        counter,
        transports
      }).onConflictDoNothing()

      return resolvedUserId
    })

    if (context.intent === 'signup') {
      const sessionToken = await fastify.auth.createSession(userId)
      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions)
    }
    logSecurityEvent({
      request,
      eventName: context.intent === 'signup'
        ? logEventNames.authLoginSucceeded
        : logEventNames.authMethodLinked,
      outcome: 'success',
      authMethod: 'passkey',
      userId,
      details: {
        intent: context.intent
      }
    })

    reply.clearCookie(PASSKEY_REG_COOKIE, { path: '/' })
    return passkeyVerifyResponseSchema.parse({ ok: true, userId })
  })

  fastify.post('/login/options', async (request, reply) => {
    const options = await generateAuthenticationOptions({
      rpID: rpid,
      userVerification: 'preferred'
    })

    reply.setCookie(PASSKEY_AUTH_COOKIE, JSON.stringify({
      challenge: options.challenge
    }), {
      ...shortLivedCookieOptions
    })

    return options
  })

  fastify.post('/login/verify', async (request, reply) => {
    const context = parseContextCookie<{ challenge: string }>(request.cookies[PASSKEY_AUTH_COOKIE])
    const body = fastify.validate(passkeyLoginVerifyRequestSchema, request.body) as unknown as AuthenticationResponseJSON
    const credentialId = body?.id ?? body?.rawId
    if (!credentialId) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'missing_credential_id'
        }
      })
      throw fastify.httpErrors.badRequest('Missing credential id')
    }

    const match = await db
      .select({
        userId: authMethods.userId,
        publicKey: passkeyCredentials.publicKey,
        counter: passkeyCredentials.counter,
        transports: passkeyCredentials.transports
      })
      .from(passkeyCredentials)
      .innerJoin(authMethods, eqAny(authMethods.id, passkeyCredentials.authMethodId))
      .where(eqAny(passkeyCredentials.credentialId, credentialId))
      .limit(1)

    if (match.length === 0) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'unknown_credential'
        }
      })
      throw fastify.httpErrors.unauthorized('Unknown credential')
    }
    let transports: AuthenticatorTransportFuture[] | undefined
    try {
      transports = match[0].transports
        ? JSON.parse(match[0].transports) as AuthenticatorTransportFuture[]
        : undefined
    } catch {
      transports = undefined
    }

    let authenticationVerification
    try {
      authenticationVerification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: context.challenge,
        expectedOrigin: allowedOrigins,
        expectedRPID: rpid,
        credential: {
          id: credentialId,
          publicKey: Buffer.from(match[0].publicKey, 'base64url'),
          counter: match[0].counter,
          transports
        }
      })
    } catch {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'login_verification_failed'
        }
      })
      throw fastify.httpErrors.unauthorized('Passkey login verification failed')
    }

    if (!authenticationVerification.verified) {
      logSecurityEvent({
        request,
        eventName: logEventNames.authLoginFailed,
        outcome: 'failure',
        authMethod: 'passkey',
        details: {
          reason: 'login_not_verified'
        }
      })
      throw fastify.httpErrors.unauthorized('Passkey authentication was not verified')
    }

    await db.update(passkeyCredentials).set({
      counter: authenticationVerification.authenticationInfo.newCounter
    }).where(eqAny(passkeyCredentials.credentialId, credentialId))

    const sessionToken = await fastify.auth.createSession(match[0].userId)
    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions)
    reply.clearCookie(PASSKEY_AUTH_COOKIE, { path: '/' })
    logSecurityEvent({
      request,
      eventName: logEventNames.authLoginSucceeded,
      outcome: 'success',
      authMethod: 'passkey',
      userId: match[0].userId
    })

    return passkeyVerifyResponseSchema.parse({
      ok: true,
      userId: match[0].userId
    })
  })
}

export default passkeyRoutes
