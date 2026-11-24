import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

export const authMiddleware = (
  req: FastifyRequest,
  res: FastifyReply,
  done: HookHandlerDoneFunction,
) => {
  const authorization = req.headers.authorization;

  const token = authorization?.split(" ")[1]?.trim();

  if (!token) {
    res.status(401).send({
      message: "Invalid API Key",
    });
    return;
  }

  req.token = token;
  done();
};
