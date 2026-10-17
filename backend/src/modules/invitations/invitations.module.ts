import { Module } from "@nestjs/common";
import { RecordsModule } from "../records.module";
import { VisitsModule } from "../visits/visits.module";
import { InvitationsController } from "./invitations.controller";
@Module({
  imports: [RecordsModule, VisitsModule],
  controllers: [InvitationsController],
  providers: [],
  exports: [],
})
export class InvitationsModule {}
