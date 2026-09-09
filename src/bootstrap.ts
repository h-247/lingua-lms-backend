import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import helmet from "helmet";
import { Pool } from "pg";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/http-exception.filter";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
  };
  express.set("trust proxy", Number(process.env.TRUST_PROXY ?? "0"));

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));

  const PgStore = connectPgSimple(session);
  const sessionPool = new Pool({
    connectionString: required("SESSION_DATABASE_URL"),
    max: 2,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });
  app.use(
    session({
      name: process.env.SESSION_COOKIE_NAME ?? "lingua.sid",
      secret: required("SESSION_SECRET"),
      store: new PgStore({
        pool: sessionPool,
        tableName: "user_session",
        createTableIfMissing: false,
      }),
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.SESSION_COOKIE_SECURE !== "false",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  const allowedOrigins = [
    process.env.APP_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  app.enableCors({
    credentials: true,
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin denied"), false);
    },
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    exposedHeaders: [
      "X-Request-Id",
      "Content-Disposition",
      "Accept-Ranges",
      "Content-Range",
    ],
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (
    process.env.DOCS_ENABLED !== "false" &&
    process.env.NODE_ENV !== "production"
  ) {
    const config = new DocumentBuilder()
      .setTitle("Lingua LMS Backend API")
      .setDescription(
        "Cookie-session REST API. Fetch CSRF token before each authenticated mutation flow.",
      )
      .setVersion("1.0")
      .addCookieAuth(process.env.SESSION_COOKIE_NAME ?? "lingua.sid")
      .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      jsonDocumentUrl: "api/docs-json",
    });
  }

  app.enableShutdownHooks();
  return app;
}
