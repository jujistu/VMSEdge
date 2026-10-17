import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { BlacklistController } from "./blacklist.controller";
@Module({
  imports: [RecordsModule],
  controllers: [BlacklistController],
  providers: [],
  exports: [],
})
export class BlacklistModule {}
