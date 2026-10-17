import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { HealthController } from "./health.controller";
@Module({
  imports: [RecordsModule],
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class HealthModule {}
