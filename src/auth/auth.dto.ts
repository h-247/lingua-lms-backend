import { IsEmail, IsString, Length, MaxLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(1, 256)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 256)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
