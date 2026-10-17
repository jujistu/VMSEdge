import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { VisitsService } from "../visits.service";
import { VisitsController } from "./visits.controller";
@Module({
  imports: [RecordsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
