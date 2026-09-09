import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowed = new Set(
    [process.env.APP_ORIGIN, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  use(req: Request, _res: Response, next: NextFunction): void {
    const origin = req.header("origin");
    if (origin && !this.allowed.has(origin)) {
      throw new ForbiddenException({
        code: "ORIGIN_DENIED",
        message: "Origin không được phép.",
      });
    }
    next();
  }
}
