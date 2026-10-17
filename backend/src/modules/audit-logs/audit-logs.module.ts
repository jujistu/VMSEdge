import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { AuditLogsController } from "./audit-logs.controller";
@Module({
  imports: [RecordsModule],
  controllers: [AuditLogsController],
  providers: [],
  exports: [],
})
export class AuditLogsModule {}
