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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Actor, fail, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import {
  ErrorResponse,
  VisitEnvelope,
  VisitListResponse,
} from "../../common/responses";
import { VisitsService } from "../visits.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiTags("visits")
@ApiBearerAuth()
@Controller("visits")
export class VisitsController {
  constructor(private v: VisitsService) {}
  @ApiOkResponse({ type: VisitListResponse }) @Roles(...all) @Get() list(
    @CurrentUser() a: Actor,
    @Query() q: D.VisitQueryDto,
  ) {
    return this.v.list(a, q);
  }
  @ApiOkResponse({ type: VisitListResponse })
  @Roles(...desk)
  @Get("occupancy")
  occupancy(@CurrentUser() a: Actor, @Query() q: D.VisitQueryDto) {
    return this.v.list(a, q, { status: "CHECKED_IN" }, true);
  }
  @Roles(...desk) @Get("lookup") lookup(
    @CurrentUser() a: Actor,
    @Query() q: D.VisitQueryDto,
  ) {
    if (!q.q) fail("SEARCH_REQUIRED", 400);
    if (q.q.startsWith("vms:invitation:")) q.q = q.q.slice(15);
    return this.v.list(a, q);
  }
  @ApiOkResponse({ type: VisitEnvelope }) @Roles(...all) @Get(":id") get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.v.detail(a, id);
  }
  @Roles(...desk) @Patch(":id") update(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UpdateVisitDto,
  ) {
    return this.v.update(a, id, d);
  }
  @Roles(...desk) @Post(":id/arrive") arrive(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "arrive", d, k);
  }
  @Roles(...desk) @Post(":id/check-in") checkIn(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "check-in", d, k);
  }
  @Roles(...desk) @Post(":id/check-out") checkOut(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "check-out", d, k);
  }
  @Roles(...all) @Post(":id/cancel") cancel(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.ReasonDto,
    @Headers("idempotency-key") k: string,
  ) {
    return this.v.action(a, id, "cancel", d, k);
  }
}
