import { Module } from "@nestjs/common";
import { ClassAccessService } from "./class-access.service";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  controllers: [ClassesController, GroupsController],
  providers: [ClassesService, GroupsService, ClassAccessService],
  exports: [ClassAccessService],
})
export class ClassesModule {}
