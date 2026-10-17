import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { VisitsModule } from "../visits/visits.module";
import { VisitorRequestsController } from "./visitor-requests.controller";
@Module({
  imports: [RecordsModule, VisitsModule],
  controllers: [VisitorRequestsController],
  providers: [],
  exports: [],
})
export class VisitorRequestsModule {}
