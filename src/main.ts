import "dotenv/config";
import "reflect-metadata";
import { createApp } from "./bootstrap";

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? "3000"), "0.0.0.0");
}

void bootstrap();
