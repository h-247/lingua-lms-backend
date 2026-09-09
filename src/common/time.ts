import { BadRequestException } from "@nestjs/common";

export function parseDeadline(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T23:59:59+07:00`
    : value;
  const result = new Date(normalized);
  if (Number.isNaN(result.getTime())) {
    throw new BadRequestException({
      code: "DATE_INVALID",
      message: "Ngày giờ không hợp lệ.",
    });
  }
  return result;
}
