import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { diskStorage } from "multer";
import { extname, resolve } from "path";
import { randomUUID } from "crypto";
import { CurrentUser, Roles } from "../common/decorators";
import { AuthenticatedUser } from "../common/types";
import {
  DraftPayloadDto,
  ExtendDeadlineDto,
  GradeHomeworkDto,
  ListAssessmentsDto,
  PracticeDraftDto,
  SubmitPayloadDto,
  UpsertAssessmentDto,
} from "./assessments.dto";
import { AssessmentsService } from "./assessments.service";

const stagingRoot = resolve(
  process.env.UPLOAD_TMP_ROOT ?? "./uploads/.staging",
);

@ApiTags("assessments")
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get("classes/:classId/assessments")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Query() dto: ListAssessmentsDto,
  ) {
    return this.assessments.list(user, classId, dto);
  }

  @Get("assessments/:id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.detail(user, id);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("classes/:classId/assessments")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Body() dto: UpsertAssessmentDto,
  ) {
    return this.assessments.create(user, classId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch("assessments/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertAssessmentDto,
  ) {
    return this.assessments.update(user, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get("assessments/:id/recipients/preview")
  preview(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.preview(user, id);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("assessments/:id/publish")
  publish(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.publish(user, id);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("assessments/:id/close")
  close(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.close(user, id);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("assessments/:id/extend-deadline")
  extend(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ExtendDeadlineDto,
  ) {
    return this.assessments.extend(user, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("assessments/:id/duplicate")
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.duplicate(user, id);
  }

  @Roles(UserRole.STUDENT)
  @Get("assessments/:id/submission")
  draft(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.getOfficialDraft(user, id);
  }

  @Roles(UserRole.STUDENT)
  @Patch("assessments/:id/submission")
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DraftPayloadDto,
  ) {
    return this.assessments.saveOfficialDraft(user, id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post("assessments/:id/submission/submit")
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SubmitPayloadDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.assessments.submitOfficial(user, id, dto, key);
  }

  @Roles(UserRole.STUDENT)
  @Get("assessments/:id/result")
  ownResult(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.assessments.ownResult(user, id);
  }

  @Roles(UserRole.STUDENT)
  @ApiConsumes("multipart/form-data")
  @Post("assessments/:id/homework-attachment")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      storage: diskStorage({
        destination: stagingRoot,
        filename: (_req, file, callback) =>
          callback(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
          ),
      }),
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assessments.uploadHomeworkAttachment(user, id, file);
  }

  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post("submissions/:submissionId/grade")
  grade(
    @CurrentUser() user: AuthenticatedUser,
    @Param("submissionId") id: string,
    @Body() dto: GradeHomeworkDto,
  ) {
    return this.assessments.grade(user, id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post("assessments/:id/practice/start")
  startPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.assessments.startPractice(user, id);
  }

  @Roles(UserRole.STUDENT)
  @Patch("assessments/:id/practice/:attemptId")
  savePractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body() dto: PracticeDraftDto,
  ) {
    return this.assessments.savePractice(user, id, attemptId, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post("assessments/:id/practice/:attemptId/submit")
  submitPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body() dto: PracticeDraftDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.assessments.submitPractice(user, id, attemptId, dto, key);
  }

  @Roles(UserRole.STUDENT)
  @Get("assessments/:id/practice")
  practiceHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query() dto: ListAssessmentsDto,
  ) {
    return this.assessments.practiceHistory(user, id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Get("assessments/:id/practice/:attemptId")
  practiceDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
  ) {
    return this.assessments.practiceDetail(user, id, attemptId);
  }
}
