import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  if (!req.id) {
    req.id = crypto.randomUUID();
  }
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestIdValue = req.id ?? "unknown";
  const tenantId = (req as Request & { tenantId?: string }).tenantId ?? "unknown";
  const userId = (req as Request & { userId?: string }).userId ?? "unknown";

  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: requestIdValue,
    });
    return;
  }

  req.log?.error(
    { err, requestId: requestIdValue, tenantId, userId },
    "Unexpected server error",
  );

  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    requestId: requestIdValue,
  });
}
