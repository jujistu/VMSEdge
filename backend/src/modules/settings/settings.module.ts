import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { SettingsController } from "./settings.controller";
@Module({
  imports: [RecordsModule],
  controllers: [SettingsController],
  providers: [],
  exports: [],
})
export class SettingsModule {}
