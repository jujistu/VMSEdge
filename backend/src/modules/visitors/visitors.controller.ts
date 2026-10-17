import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, fail, oid, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { RecordsService } from "../records.service";
import { VisitsService } from "../visits.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("visitors")
@ApiBearerAuth()
@Controller("visitors")
export class VisitorsController {
  constructor(
    private r: RecordsService,
    private v: VisitsService,
  ) {}
  @Roles(...desk) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateVisitorDto,
  ) {
    return this.r.createPerson(a, d);
  }
  @Roles(...all) @Get() list(@CurrentUser() a: Actor, @Query() q: D.PageDto) {
    return this.r.visitorPage(a, q);
  }
  @Roles(...all) @Get("search") search(
    @CurrentUser() a: Actor,
    @Query() q: D.PageDto,
  ) {
    return this.r.visitorPage(a, q);
  }
  @Roles(...all) @Get("matches") matches(
    @CurrentUser() a: Actor,
    @Query() q: D.PageDto,
  ) {
    if (!q.q) fail("SEARCH_REQUIRED", 400);
    return this.r.visitorPage(a, q);
  }
  @Roles(...all) @Get(":id") get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.r.visitorGet(a, id);
  }
  @Roles(...desk) @Patch(":id") update(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UpdateVisitorDto,
  ) {
    return this.r.visitorUpdate(a, id, d);
  }
  @Roles(...desk) @Patch(":id/status") status(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VisitorStatusDto,
  ) {
    return this.r.visitorUpdate(a, id, d, true);
  }
  @Roles(...all) @Get(":id/visits") async visits(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Query() q: D.VisitQueryDto,
  ) {
    await this.r.visitorGet(a, id);
    return this.v.list(a, q, { visitorId: oid(id) });
  }
}
