import { Module } from "@nestjs/common";
import { AuthModule } from "./auth";
import { RecordsService } from "./records.service";
@Module({
  imports: [AuthModule],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
