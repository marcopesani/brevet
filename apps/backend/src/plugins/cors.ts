import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { backendEnv } from '../lib/env'

export default fp(async (fastify) => {
  await fastify.register(cors, {
    origin: backendEnv.frontendOrigin,
    credentials: true
  })
})
