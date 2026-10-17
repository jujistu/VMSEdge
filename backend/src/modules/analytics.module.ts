import { Module } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { VisitsModule } from "./visits/visits.module";
@Module({
  imports: [VisitsModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
