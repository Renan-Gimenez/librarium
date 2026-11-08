import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

import { env } from "@/config/env";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "./app-error";

export const errorHandler = (
  error: FastifyError,
  req: FastifyRequest,
  res: FastifyReply,
) => {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return res.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Validation failed for request parameters or body",
      issues: error.validation.map((issue) => {
        const field =
          issue.instancePath.replace(/^\//, "") ||
          (typeof issue.params?.missingProperty === "string"
            ? issue.params.missingProperty
            : "unknown");

        return {
          field,
          message: issue.message,
          keyword: issue.keyword,
        };
      }),
    });
  }

  if (isResponseSerializationError(error)) {
    req.log.error(error);
    return res.status(500).send({
      statusCode: 500,
      error: "Serialization Error",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected response format error occurred."
          : `Response serialization error: ${error.message}`,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: getErrorNameByStatus(error.statusCode),
      message: error.message,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : "field";

      return res.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `A record with this ${target} already exists.`,
      });
    }

    if (error.code === "P2025") {
      return res.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Record not found in database.",
      });
    }

    if (error.code === "P2003") {
      return res.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid relation: referenced record does not exist.",
      });
    }
  }

  if (error.statusCode && error.statusCode < 500) {
    return res.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || getErrorNameByStatus(error.statusCode),
      message: error.message,
    });
  }

  req.log.error(error);

  return res.status(500).send({
    statusCode: 500,
    error: "Internal Server Error",
    message:
      env.NODE_ENV === "production"
        ? "An internal server error occurred. Please try again later."
        : error.message,
    ...(env.NODE_ENV !== "production" && { stack: error.stack }),
  });
};

function getErrorNameByStatus(status: number): string {
  const map: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
  };
  return map[status] || "Error";
}
