import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics.module";
import { RecordsModule } from "../records.module";
import { ReportsController } from "./reports.controller";
@Module({
  imports: [RecordsModule, AnalyticsModule],
  controllers: [ReportsController],
  providers: [],
  exports: [],
})
export class ReportsModule {}
