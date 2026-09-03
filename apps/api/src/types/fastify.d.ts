import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    token: string | null;
  }
}
