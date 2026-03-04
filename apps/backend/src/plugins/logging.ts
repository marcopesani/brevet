import fp from 'fastify-plugin'
import { logEventNames } from '@repo/auth-contracts/logging'
import { backendEnv } from '../lib/env'
import { shouldSampleInfoLog } from '../lib/logging'

declare module 'fastify' {
  export interface FastifyRequest {
    startedAtMs?: number
  }
}

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    request.startedAtMs = Date.now()
    reply.header('x-request-id', request.id)
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (!shouldSampleInfoLog()) {
      return
    }

    const durationMs = Date.now() - (request.startedAtMs ?? Date.now())
    request.log.info({
      service: 'backend',
      env: backendEnv.nodeEnv,
      'event.name': logEventNames.httpRequestCompleted,
      'event.category': 'http',
      'event.outcome': 'success',
      'request.id': request.id,
      'http.method': request.method,
      'http.route': request.routeOptions?.url ?? request.url,
      'http.status_code': reply.statusCode,
      duration_ms: durationMs
    }, 'request completed')
  })

  fastify.setErrorHandler((error, request, reply) => {
    const httpError = error as { statusCode?: number, code?: string }
    const durationMs = Date.now() - (request.startedAtMs || Date.now())
    request.log.error({
      err: error,
      service: 'backend',
      env: backendEnv.nodeEnv,
      'event.name': logEventNames.httpRequestFailed,
      'event.category': 'http',
      'event.outcome': 'failure',
      'request.id': request.id,
      'http.method': request.method,
      'http.route': request.routeOptions?.url ?? request.url,
      'http.status_code': httpError.statusCode ?? 500,
      duration_ms: durationMs,
      'error.code': httpError.code
    }, 'request failed')
    void reply.send(error)
  })
}, { name: 'logging' })
