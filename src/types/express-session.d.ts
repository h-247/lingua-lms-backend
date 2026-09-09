import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    authVersion?: number;
    csrfToken?: string;
  }
}
