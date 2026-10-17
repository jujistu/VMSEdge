import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { VisitsModule } from "../visits/visits.module";
import { VisitorsController } from "./visitors.controller";
@Module({
  imports: [RecordsModule, VisitsModule],
  controllers: [VisitorsController],
  providers: [],
  exports: [],
})
export class VisitorsModule {}
