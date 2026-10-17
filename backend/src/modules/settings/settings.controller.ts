import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("settings")
@ApiBearerAuth()
@Controller("settings")
export class SettingsController {
  constructor(private r: RecordsService) {}
  @Roles(...all) @Get("client") async client() {
    const s = await this.r.settings();
    return {
      organizationName: s.organizationName,
      timezone: s.timezone,
      earlyArrivalMinutes: s.earlyArrivalMinutes,
    };
  }
  @Roles(Role.ADMIN) @Get() get() {
    return this.r.settings();
  }
  @Roles(Role.ADMIN) @Patch() update(
    @CurrentUser() a: Actor,
    @Body() d: D.SettingsDto,
  ) {
    return this.r.settingsUpdate(a, d);
  }
}
