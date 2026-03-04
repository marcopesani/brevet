import fp from 'fastify-plugin'
import { createDb, type BrevetDb } from '@repo/db/client'
import { resolvePostgresUrl } from '@repo/db/env'

declare module 'fastify' {
  export interface FastifyInstance {
    db: BrevetDb
    dbPool: unknown
  }
}

export default fp(async (fastify) => {
  const connectionString = resolvePostgresUrl()
  const { db, pool } = createDb(connectionString)

  fastify.decorate('db', db)
  fastify.decorate('dbPool', pool)

  fastify.addHook('onClose', async () => {
    await pool.end()
  })
}, { name: 'db' })
