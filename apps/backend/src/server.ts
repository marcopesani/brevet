import Fastify from 'fastify'
import app from './app'
import { backendEnv } from './lib/env'
import { backendFastifyLoggingOptions } from './lib/logging'

const port = backendEnv.port
const host = backendEnv.host

const server = Fastify(backendFastifyLoggingOptions)

void server.register(app)

const start = async () => {
  try {
    await server.listen({ port, host })
    server.log.info(`Backend listening on http://${host}:${port}`)
  } catch (error) {
    server.log.error(error)
    process.exit(1)
  }
}

void start()
