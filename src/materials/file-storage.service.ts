import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { FileContext } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { createReadStream, promises as fs } from "fs";
import { basename, extname, join, resolve } from "path";
import { PrismaService } from "../prisma/prisma.service";

const materialTypes = new Map([
  ["application/pdf", [".pdf"]],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [".docx"],
  ],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    [".pptx"],
  ],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
]);
const homeworkTypes = new Map(
  [...materialTypes].filter(([mime]) => !mime.includes("presentation")),
);

@Injectable()
export class FileStorageService implements OnModuleInit {
  readonly root = resolve(process.env.FILE_ROOT ?? "./uploads");
  readonly staging = resolve(
    process.env.UPLOAD_TMP_ROOT ?? join(this.root, ".staging"),
  );

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(this.staging, { recursive: true });
  }

  async finalize(input: {
    tempPath: string;
    originalName: string;
    declaredMime: string;
    byteCount: number;
    classId: string;
    uploaderId: string;
    ownerStudentId?: string;
    context: FileContext;
  }) {
    await this.initialize();
    const allowed =
      input.context === FileContext.MATERIAL ? materialTypes : homeworkTypes;
    const max =
      input.context === FileContext.MATERIAL
        ? 10 * 1024 * 1024
        : 5 * 1024 * 1024;
    if (input.byteCount <= 0 || input.byteCount > max) {
      await fs.rm(input.tempPath, { force: true });
      throw new BadRequestException({
        code: "FILE_SIZE_INVALID",
        message: "Kích thước tệp không hợp lệ.",
      });
    }
    const extension = extname(input.originalName).toLowerCase();
    const detectedMime = await this.detectMime(
      input.tempPath,
      extension,
      input.byteCount,
    );
    if (
      !detectedMime ||
      !allowed.has(detectedMime) ||
      !allowed.get(detectedMime)?.includes(extension)
    ) {
      await fs.rm(input.tempPath, { force: true });
      throw new UnsupportedMediaTypeException({
        code: "FILE_TYPE_INVALID",
        message: "Định dạng hoặc chữ ký tệp không hợp lệ.",
      });
    }
    if (
      detectedMime !== input.declaredMime &&
      !(detectedMime === "image/jpeg" && input.declaredMime === "image/jpg")
    ) {
      await fs.rm(input.tempPath, { force: true });
      throw new UnsupportedMediaTypeException({
        code: "MIME_MISMATCH",
        message: "MIME khai báo không khớp nội dung tệp.",
      });
    }

    const hash = createHash("sha256");
    for await (const chunk of createReadStream(input.tempPath))
      hash.update(chunk as Buffer);
    const storageKey = `${randomUUID()}${extension}`;
    const target = this.resolveKey(storageKey);
    const asset = await this.prisma.fileAsset.create({
      data: {
        classId: input.classId,
        uploaderId: input.uploaderId,
        ownerStudentId: input.ownerStudentId,
        context: input.context,
        storageKey,
        originalName: basename(input.originalName).slice(0, 255),
        mediaType: detectedMime,
        byteCount: input.byteCount,
        sha256: hash.digest("hex"),
      },
    });
    try {
      await fs.rename(input.tempPath, target);
      return await this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: { status: "READY", readyAt: new Date() },
      });
    } catch (error) {
      await this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: { status: "FAILED" },
      });
      await fs.rm(input.tempPath, { force: true });
      throw error;
    }
  }

  resolveKey(key: string): string {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(key))
      throw new BadRequestException({
        code: "FILE_KEY_INVALID",
        message: "Khóa tệp không hợp lệ.",
      });
    const full = resolve(this.root, key);
    if (!full.startsWith(`${this.root}\\`) && !full.startsWith(`${this.root}/`))
      throw new BadRequestException({
        code: "FILE_PATH_INVALID",
        message: "Đường dẫn tệp không hợp lệ.",
      });
    return full;
  }

  private async detectMime(
    path: string,
    extension: string,
    size: number,
  ): Promise<string | null> {
    const handle = await fs.open(path, "r");
    try {
      const head = Buffer.alloc(Math.min(size, 16));
      await handle.read(head, 0, head.length, 0);
      if (head.subarray(0, 5).toString("ascii") === "%PDF-")
        return "application/pdf";
      if (
        head
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      )
        return "image/png";
      if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
        return "image/jpeg";
      if (
        head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
        [".docx", ".pptx"].includes(extension)
      ) {
        const tailSize = Math.min(size, 1024 * 1024);
        const tail = Buffer.alloc(tailSize);
        await handle.read(tail, 0, tailSize, size - tailSize);
        const listing = tail.toString("latin1");
        if (extension === ".docx" && listing.includes("word/document.xml"))
          return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (extension === ".pptx" && listing.includes("ppt/presentation.xml"))
          return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      }
      return null;
    } finally {
      await handle.close();
    }
  }
}
