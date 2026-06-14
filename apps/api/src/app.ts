import { fastify } from "fastify";
import {
  validatorCompiler,
  serializerCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

export const app = fastify().withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get("/health", async () => {
  return { ok: true };
});

app.post(
  "/",
  {
    schema: {
      body: z.object({
        message: z.string().min(5),
      }),
    },
  },
  (req, res) => {
    const { message } = req.body;
    res.send({
      message: message,
    });
  },
);
