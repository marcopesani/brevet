import { FastifyPluginAsync } from 'fastify'

const helloRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/hello', async () => ({
    app: 'backend',
    message: 'Hello from Fastify',
    timestamp: new Date().toISOString()
  }))
}

export default helloRoute
