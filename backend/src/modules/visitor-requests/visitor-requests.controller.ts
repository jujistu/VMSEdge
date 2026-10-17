import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { VisitsService } from "../visits.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("visitor-requests")
@ApiBearerAuth()
@Controller("visitor-requests")
export class VisitorRequestsController {
  constructor(private v: VisitsService) {}
  @Roles(...desk) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateRequestDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.create(a, d, "WALK_IN", k);
  }
  @Roles(...all) @Get() list(
    @CurrentUser() a: Actor,
    @Query() q: D.VisitQueryDto,
  ) {
    return this.v.linkedList(a, q, "request");
  }
  @Roles(...all) @Get(":id") get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.v.linkedDetail(a, id, "request");
  }
  @Roles(...hosts) @Post(":id/approve") approve(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "approve", d, k, "request");
  }
  @Roles(...hosts) @Post(":id/reject") reject(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.ReasonDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "reject", d, k, "request");
  }
}
