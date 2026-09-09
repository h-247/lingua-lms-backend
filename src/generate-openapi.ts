import "dotenv/config";
import { writeFile } from "fs/promises";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function main(): Promise<void> {
  process.env.OPENAPI_ONLY = "true";
  const { createApp } = await import("./bootstrap");
  const app = await createApp();
  await app.init();
  const config = new DocumentBuilder()
    .setTitle("Lingua LMS Backend API")
    .setVersion("1.0.0")
    .addCookieAuth(process.env.SESSION_COOKIE_NAME ?? "lingua.sid")
    .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  await writeFile(
    "openapi.json",
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
  await app.close();
}

void main();
