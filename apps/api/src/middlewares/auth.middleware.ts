import type { FastifyReply, FastifyRequest } from "fastify";

export const authMiddleware = async (
  req: FastifyRequest,
  res: FastifyReply,
) => {
  const authorization = req.headers.authorization;

  const token = authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).send({
      message: "Invalid API Key",
    });
  }

  req.token = token;
};
