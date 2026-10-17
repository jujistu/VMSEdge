import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { NotificationsController } from "./notifications.controller";
@Module({
  imports: [RecordsModule],
  controllers: [NotificationsController],
  providers: [],
  exports: [],
})
export class NotificationsModule {}
