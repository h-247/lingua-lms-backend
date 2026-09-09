import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const supplied = req.header("x-request-id");
    const requestId =
      supplied && /^[a-zA-Z0-9._-]{1,80}$/.test(supplied)
        ? supplied
        : randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  }
}
