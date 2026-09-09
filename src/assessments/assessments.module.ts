import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { MaterialsModule } from "../materials/materials.module";
import { AssessmentsController } from "./assessments.controller";
import { AssessmentsService } from "./assessments.service";

@Module({
  imports: [ClassesModule, MaterialsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}
