import * as assert from 'node:assert'
import { test } from 'node:test'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import loggingPlugin from '../../src/plugins/logging'
import { backendFastifyLoggingOptions, backendLoggerOptions } from '../../src/lib/logging'

test('backend logger redaction is enabled for sensitive fields', () => {
  assert.ok(backendLoggerOptions.redact)
  assert.equal((backendLoggerOptions.redact as { censor?: string }).censor, '[REDACTED]')
  const paths = (backendLoggerOptions.redact as { paths: string[] }).paths
  assert.ok(paths.includes('req.headers.authorization'))
  assert.ok(paths.includes('request.cookies'))
  assert.ok(paths.includes('secretHash'))
})

test('request id is propagated from inbound x-request-id', async () => {
  const app = Fastify(backendFastifyLoggingOptions)
  await app.register(sensible)
  await app.register(loggingPlugin)
  app.get('/health', async () => ({ ok: true }))

  const response = await app.inject({
    method: 'GET',
    url: '/health',
    headers: {
      'x-request-id': 'request-id-from-client'
    }
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['x-request-id'], 'request-id-from-client')
  await app.close()
})
