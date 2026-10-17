import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics.module";
import { RecordsModule } from "../records.module";
import { DepartmentsController } from "./departments.controller";
@Module({
  imports: [RecordsModule, AnalyticsModule],
  controllers: [DepartmentsController],
  providers: [],
  exports: [],
})
export class DepartmentsModule {}
