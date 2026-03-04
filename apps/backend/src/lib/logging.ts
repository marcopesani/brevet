import { randomUUID } from 'node:crypto'
import { logLevelSchema } from '@repo/auth-contracts/logging'
import { backendEnv } from './env'

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["set-cookie"]',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers["x-api-key"]',
  'request.cookies',
  'request.body.signature',
  'request.body.message',
  'request.body.challenge',
  'request.body.credential',
  'response.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'cookies',
  'signature',
  'token',
  'secret',
  'secretHash',
  'sessionToken'
]

const parseLogLevel = () => {
  const parsed = logLevelSchema.safeParse(backendEnv.logLevel)
  return parsed.success ? parsed.data : 'info'
}

const parseSampleRate = () => {
  const candidate = Number(backendEnv.logSampleRate)
  if (!Number.isFinite(candidate)) {
    return 1
  }
  return Math.max(0, Math.min(1, candidate))
}

export const backendLogLevel = parseLogLevel()
export const backendLogSampleRate = parseSampleRate()

export const shouldSampleInfoLog = () => (
  backendLogSampleRate >= 1 || Math.random() <= backendLogSampleRate
)

export const backendLoggerOptions = {
  level: backendLogLevel,
  messageKey: 'message',
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  redact: backendEnv.logRedact
    ? {
      paths: redactPaths,
      censor: '[REDACTED]'
    }
    : undefined,
  serializers: {
    req: (request: any) => ({
      method: request.method,
      url: request.url,
      route: request.routeOptions?.url,
      remoteAddress: request.ip
    }),
    res: (response: any) => ({
      statusCode: response.statusCode
    }),
    err: (error: any) => ({
      type: error?.name,
      message: error?.message,
      code: error?.code,
      stack: backendEnv.isProduction ? undefined : error?.stack
    })
  }
}

export const backendFastifyLoggingOptions = {
  logger: backendLoggerOptions,
  disableRequestLogging: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  genReqId: (request: any) => {
    const inboundHeader = request.headers['x-request-id']
    if (typeof inboundHeader === 'string' && inboundHeader.length > 0) {
      return inboundHeader
    }
    return randomUUID()
  }
}
