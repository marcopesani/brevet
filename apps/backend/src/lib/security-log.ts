import type { FastifyRequest } from 'fastify'
import { logEventNames } from '@repo/auth-contracts/logging'
import { backendEnv } from './env'

type SecurityOutcome = 'success' | 'failure'

type SecurityEventInput = {
  request: FastifyRequest
  eventName: (typeof logEventNames)[keyof typeof logEventNames]
  outcome: SecurityOutcome
  userId?: string
  authMethod?: 'passkey' | 'wallet' | 'api-key' | 'session'
  details?: Record<string, unknown>
}

export const logSecurityEvent = ({
  request,
  eventName,
  outcome,
  userId,
  authMethod,
  details
}: SecurityEventInput) => {
  request.log.info({
    service: 'backend',
    env: backendEnv.nodeEnv,
    'event.name': eventName,
    'event.category': 'security',
    'event.outcome': outcome,
    'request.id': request.id,
    'user.id': userId,
    auth_method: authMethod,
    ...details
  }, 'security event')
}
