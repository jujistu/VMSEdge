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
import { Actor, Role, safe } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("blacklist")
@ApiBearerAuth()
@Controller("blacklist")
export class BlacklistController {
  constructor(private r: RecordsService) {}
  @Roles(Role.ADMIN) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateBlacklistDto,
  ) {
    return this.r.blacklistAdd(a, d);
  }
  @Roles(Role.ADMIN) @Get() list(@Query() q: D.PageDto) {
    return this.r.page("blacklist", {}, q);
  }
  @Roles(...desk) @Get("check") async check(@Query() q: D.BlacklistCheckDto) {
    return this.r.blacklistCheck(q.visitorId);
  }
  @Roles(Role.ADMIN) @Get(":id") async get(@Param("id") id: string) {
    return safe(await this.r.get("blacklist", id));
  }
  @Roles(Role.ADMIN) @Patch(":id/lift") lift(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.ReasonDto,
  ) {
    return this.r.blacklistLift(a, id, d);
  }
}
