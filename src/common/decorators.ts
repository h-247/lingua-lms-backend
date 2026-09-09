import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Request } from "express";
import { AuthenticatedUser } from "./types";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    (
      context.switchToHttp().getRequest<Request>() as Request & {
        user: AuthenticatedUser;
      }
    ).user,
);
