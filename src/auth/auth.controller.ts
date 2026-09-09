import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { CurrentUser, Public } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto } from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get("csrf")
  getCsrf(@Req() req: Request) {
    req.session.csrfToken ??= this.auth.generateCsrf();
    return { csrfToken: req.session.csrfToken };
  }

  @Public()
  @Post("login")
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    const user = await this.auth.validateLogin(dto.email, dto.password);
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.userId = user.id;
    req.session.authVersion = user.authVersion;
    req.session.csrfToken = this.auth.generateCsrf();
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      csrfToken: req.session.csrfToken,
    };
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post("change-password")
  async changePassword(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    const changed = await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    req.session.authVersion = changed.authVersion;
    return { changed: true };
  }

  @Post("logout")
  async logout(@Req() req: Request) {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { loggedOut: true };
  }
}
