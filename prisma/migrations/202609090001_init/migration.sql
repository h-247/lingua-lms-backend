-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "MaterialVisibility" AS ENUM ('STUDENTS', 'TEACHERS_ONLY');

-- CreateEnum
CREATE TYPE "SkillTag" AS ENUM ('READING', 'WRITING', 'LISTENING', 'SPEAKING', 'GRAMMAR', 'VOCABULARY');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "FileContext" AS ENUM ('MATERIAL', 'HOMEWORK_ATTACHMENT');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('HOMEWORK', 'GRADED_QUIZ', 'PRACTICE_QUIZ');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssessmentAudience" AS ENUM ('WHOLE_CLASS', 'SELECTED_GROUPS');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "PracticeAttemptStatus" AS ENUM ('DRAFT', 'GRADED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "AuthAttemptLimit" (
    "emailKey" VARCHAR(320) NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthAttemptLimit_pkey" PRIMARY KEY ("emailKey")
);

-- CreateTable
CREATE TABLE "LearningClass" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "level" "Level" NOT NULL,
    "teacherId" UUID NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "status" "ClassStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LearningClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerGroup" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(120) NOT NULL,
    "purpose" VARCHAR(500),
    "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LearnerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "ownerStudentId" UUID,
    "context" "FileContext" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mediaType" VARCHAR(120) NOT NULL,
    "byteCount" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "position" INTEGER NOT NULL,
    "type" "MaterialType" NOT NULL,
    "visibility" "MaterialVisibility" NOT NULL,
    "fileAssetId" UUID,
    "externalUrl" VARCHAR(2048),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSkill" (
    "materialId" UUID NOT NULL,
    "skill" "SkillTag" NOT NULL,

    CONSTRAINT "MaterialSkill_pkey" PRIMARY KEY ("materialId","skill")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "kind" "AssessmentKind" NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "AssessmentAudience" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "instructions" VARCHAR(5000),
    "maxPoints" DECIMAL(10,2),
    "dueAt" TIMESTAMPTZ(3),
    "allowLate" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentGroup" (
    "assessmentId" UUID NOT NULL,
    "groupId" UUID NOT NULL,

    CONSTRAINT "AssessmentGroup_pkey" PRIMARY KEY ("assessmentId","groupId")
);

-- CreateTable
CREATE TABLE "AssessmentRecipient" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentMaterial" (
    "assessmentId" UUID NOT NULL,
    "materialId" UUID NOT NULL,

    CONSTRAINT "AssessmentMaterial_pkey" PRIMARY KEY ("assessmentId","materialId")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" VARCHAR(2000) NOT NULL,
    "explanation" VARCHAR(2000),
    "points" DECIMAL(10,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "receiptId" UUID,
    "assessmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "textAnswer" VARCHAR(20000),
    "answers" JSONB,
    "attachmentId" UUID,
    "payloadHash" CHAR(64),
    "idempotencyKey" VARCHAR(120),
    "submittedAt" TIMESTAMPTZ(3),
    "isLate" BOOLEAN,
    "earnedPoints" DECIMAL(10,2),
    "maxPoints" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "feedback" VARCHAR(5000),
    "gradedById" UUID,
    "gradedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" UUID NOT NULL,
    "receiptId" UUID,
    "assessmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PracticeAttemptStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB,
    "payloadHash" CHAR(64),
    "idempotencyKey" VARCHAR(120),
    "earnedPoints" DECIMAL(10,2),
    "maxPoints" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "classId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(80) NOT NULL,
    "resourceId" VARCHAR(80) NOT NULL,
    "reason" VARCHAR(500),
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "IDX_user_session_expire" ON "user_session"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "LearningClass_code_key" ON "LearningClass"("code");

-- CreateIndex
CREATE INDEX "LearningClass_teacherId_status_idx" ON "LearningClass"("teacherId", "status");

-- CreateIndex
CREATE INDEX "LearningClass_status_code_idx" ON "LearningClass"("status", "code");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_classId_status_idx" ON "Enrollment"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_classId_studentId_key" ON "Enrollment"("classId", "studentId");

-- CreateIndex
CREATE INDEX "LearnerGroup_classId_status_idx" ON "LearnerGroup"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerGroup_classId_nameKey_key" ON "LearnerGroup"("classId", "nameKey");

-- CreateIndex
CREATE INDEX "GroupMembership_studentId_groupId_idx" ON "GroupMembership"("studentId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_studentId_key" ON "GroupMembership"("groupId", "studentId");

-- CreateIndex
CREATE INDEX "Section_classId_position_id_idx" ON "Section"("classId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_classId_status_context_idx" ON "FileAsset"("classId", "status", "context");

-- CreateIndex
CREATE INDEX "FileAsset_ownerStudentId_context_idx" ON "FileAsset"("ownerStudentId", "context");

-- CreateIndex
CREATE UNIQUE INDEX "Material_fileAssetId_key" ON "Material"("fileAssetId");

-- CreateIndex
CREATE INDEX "Material_classId_sectionId_position_id_idx" ON "Material"("classId", "sectionId", "position", "id");

-- CreateIndex
CREATE INDEX "Assessment_classId_status_kind_createdAt_idx" ON "Assessment"("classId", "status", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_dueAt_status_idx" ON "Assessment"("dueAt", "status");

-- CreateIndex
CREATE INDEX "AssessmentGroup_groupId_idx" ON "AssessmentGroup"("groupId");

-- CreateIndex
CREATE INDEX "AssessmentRecipient_studentId_assessmentId_idx" ON "AssessmentRecipient"("studentId", "assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRecipient_assessmentId_studentId_key" ON "AssessmentRecipient"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "AssessmentMaterial_materialId_idx" ON "AssessmentMaterial"("materialId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_position_id_idx" ON "AssessmentQuestion"("assessmentId", "position", "id");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_position_id_idx" ON "QuestionOption"("questionId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_receiptId_key" ON "Submission"("receiptId");

-- CreateIndex
CREATE INDEX "Submission_assessmentId_status_submittedAt_idx" ON "Submission"("assessmentId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "Submission_studentId_status_idx" ON "Submission"("studentId", "status");

-- CreateIndex
CREATE INDEX "Submission_idempotencyKey_idx" ON "Submission"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assessmentId_studentId_key" ON "Submission"("assessmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_receiptId_key" ON "PracticeAttempt"("receiptId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_assessmentId_studentId_status_idx" ON "PracticeAttempt"("assessmentId", "studentId", "status");

-- CreateIndex
CREATE INDEX "PracticeAttempt_studentId_status_submittedAt_idx" ON "PracticeAttempt"("studentId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_idempotencyKey_idx" ON "PracticeAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_assessmentId_studentId_attemptNumber_key" ON "PracticeAttempt"("assessmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_classId_createdAt_id_idx" ON "AuditEvent"("classId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "LearningClass" ADD CONSTRAINT "LearningClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerGroup" ADD CONSTRAINT "LearnerGroup_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LearnerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_ownerStudentId_fkey" FOREIGN KEY ("ownerStudentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSkill" ADD CONSTRAINT "MaterialSkill_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentGroup" ADD CONSTRAINT "AssessmentGroup_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentGroup" ADD CONSTRAINT "AssessmentGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LearnerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRecipient" ADD CONSTRAINT "AssessmentRecipient_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRecipient" ADD CONSTRAINT "AssessmentRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentMaterial" ADD CONSTRAINT "AssessmentMaterial_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentMaterial" ADD CONSTRAINT "AssessmentMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "LearningClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain integrity beyond what Prisma's schema language can express.
ALTER TABLE "LearningClass" ADD CONSTRAINT "LearningClass_date_order_ck" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");
ALTER TABLE "Section" ADD CONSTRAINT "Section_position_ck" CHECK ("position" >= 0);
ALTER TABLE "Material" ADD CONSTRAINT "Material_position_ck" CHECK ("position" >= 0);
ALTER TABLE "Material" ADD CONSTRAINT "Material_exactly_one_source_ck" CHECK (
  ("type" = 'FILE' AND "fileAssetId" IS NOT NULL AND "externalUrl" IS NULL) OR
  ("type" = 'LINK' AND "fileAssetId" IS NULL AND "externalUrl" LIKE 'https://%')
);
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_byte_count_ck" CHECK ("byteCount" > 0 AND "byteCount" <= 10485760);
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_owner_context_ck" CHECK (
  ("context" = 'MATERIAL' AND "ownerStudentId" IS NULL) OR
  ("context" = 'HOMEWORK_ATTACHMENT' AND "ownerStudentId" IS NOT NULL AND "byteCount" <= 5242880)
);
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_kind_fields_ck" CHECK (
  ("kind" = 'HOMEWORK' AND "maxPoints" > 0 AND "dueAt" IS NOT NULL) OR
  ("kind" = 'GRADED_QUIZ' AND "maxPoints" > 0 AND "dueAt" IS NOT NULL) OR
  ("kind" = 'PRACTICE_QUIZ' AND "maxPoints" > 0 AND "dueAt" IS NULL AND "allowLate" = false)
);
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_points_position_ck" CHECK ("points" > 0 AND "position" >= 0);
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_position_ck" CHECK ("position" >= 0);
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_revision_score_ck" CHECK (
  "revision" >= 0 AND
  ("earnedPoints" IS NULL OR ("earnedPoints" >= 0 AND "maxPoints" > 0 AND "earnedPoints" <= "maxPoints")) AND
  ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100))
);
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_revision_score_ck" CHECK (
  "revision" >= 0 AND "attemptNumber" > 0 AND
  ("earnedPoints" IS NULL OR ("earnedPoints" >= 0 AND "maxPoints" > 0 AND "earnedPoints" <= "maxPoints")) AND
  ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100))
);

CREATE UNIQUE INDEX "PracticeAttempt_one_draft_per_student_quiz"
  ON "PracticeAttempt" ("assessmentId", "studentId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "PracticeAttempt_idempotency_scope_key"
  ON "PracticeAttempt" ("assessmentId", "studentId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_lms_cross_table_invariants() RETURNS trigger AS $$
DECLARE
  expected_role "UserRole";
  assessment_kind "AssessmentKind";
  assessment_class UUID;
  group_class UUID;
BEGIN
  IF TG_TABLE_NAME = 'LearningClass' THEN
    SELECT role INTO expected_role FROM "User" WHERE id = NEW."teacherId";
    IF expected_role IS DISTINCT FROM 'TEACHER' THEN RAISE EXCEPTION 'class teacher must have TEACHER role' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'Enrollment' THEN
    SELECT role INTO expected_role FROM "User" WHERE id = NEW."studentId";
    IF expected_role IS DISTINCT FROM 'STUDENT' THEN RAISE EXCEPTION 'enrollment user must have STUDENT role' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'GroupMembership' THEN
    SELECT "classId" INTO group_class FROM "LearnerGroup" WHERE id = NEW."groupId";
    IF NOT EXISTS (SELECT 1 FROM "Enrollment" e JOIN "User" u ON u.id = e."studentId" WHERE e."classId" = group_class AND e."studentId" = NEW."studentId" AND e.status = 'ACTIVE' AND u.role = 'STUDENT' AND u.status = 'ACTIVE')
      THEN RAISE EXCEPTION 'group member requires active same-class enrollment' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'AssessmentRecipient' THEN
    SELECT "classId" INTO assessment_class FROM "Assessment" WHERE id = NEW."assessmentId";
    IF NOT EXISTS (SELECT 1 FROM "Enrollment" e JOIN "User" u ON u.id = e."studentId" WHERE e."classId" = assessment_class AND e."studentId" = NEW."studentId" AND e.status = 'ACTIVE' AND u.role = 'STUDENT' AND u.status = 'ACTIVE')
      THEN RAISE EXCEPTION 'recipient requires active same-class enrollment' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'Submission' THEN
    SELECT kind INTO assessment_kind FROM "Assessment" WHERE id = NEW."assessmentId";
    IF assessment_kind = 'PRACTICE_QUIZ' OR NOT EXISTS (SELECT 1 FROM "AssessmentRecipient" WHERE "assessmentId" = NEW."assessmentId" AND "studentId" = NEW."studentId")
      THEN RAISE EXCEPTION 'official submission requires official assessment recipient' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'PracticeAttempt' THEN
    SELECT kind INTO assessment_kind FROM "Assessment" WHERE id = NEW."assessmentId";
    IF assessment_kind IS DISTINCT FROM 'PRACTICE_QUIZ' OR NOT EXISTS (SELECT 1 FROM "AssessmentRecipient" WHERE "assessmentId" = NEW."assessmentId" AND "studentId" = NEW."studentId")
      THEN RAISE EXCEPTION 'practice attempt requires practice assessment recipient' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LearningClass_role_guard" BEFORE INSERT OR UPDATE OF "teacherId" ON "LearningClass" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
CREATE TRIGGER "Enrollment_role_guard" BEFORE INSERT OR UPDATE OF "studentId" ON "Enrollment" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
CREATE TRIGGER "GroupMembership_scope_guard" BEFORE INSERT OR UPDATE ON "GroupMembership" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
CREATE TRIGGER "AssessmentRecipient_scope_guard" BEFORE INSERT OR UPDATE ON "AssessmentRecipient" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
CREATE TRIGGER "Submission_kind_guard" BEFORE INSERT OR UPDATE OF "assessmentId", "studentId" ON "Submission" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
CREATE TRIGGER "PracticeAttempt_kind_guard" BEFORE INSERT OR UPDATE OF "assessmentId", "studentId" ON "PracticeAttempt" FOR EACH ROW EXECUTE FUNCTION enforce_lms_cross_table_invariants();
