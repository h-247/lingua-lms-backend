import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const res = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    let message = "Đã xảy ra lỗi máy chủ.";
    let code = "INTERNAL_ERROR";
    let fieldErrors: unknown;

    if (typeof raw === "string") {
      message = raw;
      code = `HTTP_${status}`;
    } else if (raw && typeof raw === "object") {
      const body = raw as Record<string, unknown>;
      const rawMessage = body.message;
      message = Array.isArray(rawMessage)
        ? rawMessage.join("; ")
        : String(rawMessage ?? message);
      code = String(body.code ?? `HTTP_${status}`);
      fieldErrors = body.fieldErrors;
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} requestId=${req.requestId ?? "-"} status=${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      code,
      message,
      requestId: req.requestId ?? null,
      ...(fieldErrors ? { fieldErrors } : {}),
    });
  }
}
