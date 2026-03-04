import * as assert from 'node:assert'
import { test } from 'node:test'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import sensible from '@fastify/sensible'
import { z } from 'zod'
import { SiweMessage } from 'siwe'
import passkeyRoutes from '../../src/routes/auth/passkey'
import siwxRoutes from '../../src/routes/auth/siwx'

const buildPasskeyDbMock = () => ({
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(buildPasskeyDbMock()),
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => ([
            {
              userId: '6fa6e93a-26b8-487d-87f7-32b8ec8f87a2',
              publicKey: Buffer.from('not-a-real-key').toString('base64url'),
              counter: 1,
              transports: JSON.stringify(['internal'])
            }
          ])
        })
      })
    })
  }),
  update: () => ({
    set: () => ({
      where: async () => undefined
    })
  })
})

test('passkey login rejects invalid cryptographic assertion', async () => {
  const app = Fastify()
  await app.register(sensible)
  await app.register(cookie)

  app.decorate('auth', {
    createSession: async () => 'token',
    getSessionUser: async () => null,
    requireSessionUser: async () => ({ id: 'x', username: null }),
    clearSession: async () => undefined,
    hashSecret: (value: string) => value,
    createApiKeyMaterial: () => ({ key: 'k', prefix: 'p', secretHash: 'h' }),
    resolveApiKeyUserId: async () => null
  })
  app.decorate('db', buildPasskeyDbMock())
  app.decorate('validate', <T>(schema: z.ZodType<T>, payload: unknown) => schema.parse(payload))

  await app.register(passkeyRoutes, { prefix: '/auth/passkey' })
  const context = encodeURIComponent(JSON.stringify({ challenge: 'challenge-1' }))

  const response = await app.inject({
    method: 'POST',
    url: '/auth/passkey/login/verify',
    headers: {
      cookie: `brevet_passkey_auth=${context}`
    },
    payload: {
      id: 'credential-id',
      response: {}
    }
  })

  assert.equal(response.statusCode, 401)
  assert.match(response.body, /verification failed/i)
  await app.close()
})

const buildSiwxDbMock = () => ({
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(buildSiwxDbMock()),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => ([
          {
            id: '8ce4cf93-a7da-4b8f-b1f4-2ffebf5aeb95',
            userId: '8d4f50ec-7830-4702-9f88-c74c95fbd183'
          }
        ])
      })
    })
  }),
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => ([{ id: 'used' }])
      })
    })
  })
})

test('siwx link rejects nonce ownership mismatch', async () => {
  const app = Fastify()
  await app.register(sensible)
  await app.register(cookie)

  app.decorate('auth', {
    createSession: async () => 'token',
    getSessionUser: async () => null,
    requireSessionUser: async () => ({
      id: '2d5db1f8-b2f3-4f29-8588-d5f067bb42bb',
      username: null
    }),
    clearSession: async () => undefined,
    hashSecret: (value: string) => value,
    createApiKeyMaterial: () => ({ key: 'k', prefix: 'p', secretHash: 'h' }),
    resolveApiKeyUserId: async () => null
  })
  app.decorate('db', buildSiwxDbMock())
  app.decorate('validate', <T>(schema: z.ZodType<T>, payload: unknown) => schema.parse(payload))

  const originalVerify = SiweMessage.prototype.verify
  SiweMessage.prototype.verify = async () => ({ success: true }) as Awaited<ReturnType<typeof originalVerify>>

  await app.register(siwxRoutes, { prefix: '/auth/siwx' })

  const nonce = '0123456789abcd'
  const message = new SiweMessage({
    domain: 'localhost:3000',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    statement: 'Sign in to Brevet via SIWX',
    uri: 'http://localhost:3000',
    version: '1',
    chainId: 1,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 60_000).toISOString()
  }).prepareMessage()

  const response = await app.inject({
    method: 'POST',
    url: '/auth/siwx/verify',
    headers: {
      cookie: 'brevet_session=some-session'
    },
    payload: {
      address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      chainId: 1,
      message,
      signature: '0xdeadbeef',
      intent: 'link'
    }
  })

  SiweMessage.prototype.verify = originalVerify
  assert.equal(response.statusCode, 401)
  assert.match(response.body, /owner mismatch/i)
  await app.close()
})
