import fp from 'fastify-plugin'
import { ZodError, type ZodType } from 'zod'

declare module 'fastify' {
  export interface FastifyInstance {
    validate<T>(schema: ZodType<T>, payload: unknown): T
  }
}

export default fp(async (fastify) => {
  fastify.decorate('validate', function validate<T> (schema: ZodType<T>, payload: unknown): T {
    try {
      return schema.parse(payload)
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        throw fastify.httpErrors.badRequest('Invalid payload', {
          issues: error.issues
        })
      }
      throw error
    }
  })
}, { name: 'validation' })
