import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { Actor, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { VisitsService } from "../visits.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiHeader({
  name: "Idempotency-Key",
  description: "Required on POST commands",
  required: false,
})
@ApiTags("invitations")
@ApiBearerAuth()
@Controller("invitations")
export class InvitationsController {
  constructor(private v: VisitsService) {}
  @Roles(...hosts) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateInvitationDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.create(a, d, "INVITATION", k);
  }
  @Roles(...all) @Get() list(
    @CurrentUser() a: Actor,
    @Query() q: D.VisitQueryDto,
  ) {
    return this.v.linkedList(a, q, "invitation");
  }
  @Roles(...all) @Get(":id") get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.v.linkedDetail(a, id, "invitation");
  }
  @Roles(...hosts) @Patch(":id") update(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UpdateInvitationDto,
  ) {
    return this.v.update(a, id, d, true);
  }
  @Roles(...hosts) @Post(":id/activate") activate(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "activate", d, k, "invitation");
  }
  @Roles(...hosts) @Post(":id/cancel") cancel(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.ReasonDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "cancel", d, k, "invitation");
  }
  @Roles(...hosts) @Get(":id/share") share(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.v.share(a, id);
  }
  @Roles(...hosts) @Post(":id/resend") resend(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.resend(a, id, d, k);
  }
}
