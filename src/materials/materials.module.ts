import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { FileStorageService } from "./file-storage.service";
import { MaterialsController } from "./materials.controller";
import { MaterialsService } from "./materials.service";

@Module({
  imports: [ClassesModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, FileStorageService],
  exports: [FileStorageService],
})
export class MaterialsModule {}
