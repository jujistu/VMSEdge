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
import { Actor, fail, Role, safe } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private r: RecordsService) {}
  @Roles(Role.ADMIN) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateUserDto,
  ) {
    return this.r.userCreate(a, d);
  }
  @Roles(Role.ADMIN) @Get() list(@Query() q: D.PageDto) {
    return this.r.page("users", {}, q);
  }
  @Roles(...desk) @Get("hosts") hosts(@Query() q: D.PageDto) {
    return this.r.page("users", { role: "STAFF", status: "ACTIVE" }, q, {
      firstName: 1,
      lastName: 1,
      departmentId: 1,
    });
  }
  @Roles(...all) @Patch("me") self(
    @CurrentUser() a: Actor,
    @Body() d: D.ProfileDto,
  ) {
    return this.r.selfUpdate(a, d);
  }
  @Roles(...all) @Get(":id") async get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    if (a.role !== Role.ADMIN && a.id !== id) fail("RESOURCE_NOT_FOUND", 404);
    return safe(await this.r.get("users", id));
  }
  @Roles(Role.ADMIN) @Patch(":id") update(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UpdateUserDto,
  ) {
    return this.r.userUpdate(a, id, d);
  }
  @Roles(Role.ADMIN) @Patch(":id/status") status(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UserStatusDto,
  ) {
    return this.r.userUpdate(a, id, d, true);
  }
  @Roles(Role.ADMIN) @Post(":id/resend-setup") resend(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.r.resendSetup(a, id);
  }
}
