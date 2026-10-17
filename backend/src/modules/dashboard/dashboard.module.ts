import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics.module";
import { RecordsModule } from "../records.module";
import { DashboardController } from "./dashboard.controller";
@Module({
  imports: [RecordsModule, AnalyticsModule],
  controllers: [DashboardController],
  providers: [],
  exports: [],
})
export class DashboardModule {}
