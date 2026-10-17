import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { UsersController } from "./users.controller";
@Module({
  imports: [RecordsModule],
  controllers: [UsersController],
  providers: [],
  exports: [],
})
export class UsersModule {}
