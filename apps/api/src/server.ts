import { app } from "@/app";

import { env } from "@/config/env";

const server = async () => {
  app.listen({ port: env.PORT, host: env.HOST });
  console.log(`Server running on port ${env.PORT}`);
};

server();
