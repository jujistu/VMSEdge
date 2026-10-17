import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, Role } from "../../common/domain";
import { CurrentUser, Roles } from "../../common/http";
import { AnalyticsService } from "../analytics.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private s: AnalyticsService) {}
  @Roles(Role.ADMIN) @Get("admin") admin(@CurrentUser() a: Actor) {
    return this.s.dashboard(a, "admin");
  }
  @Roles(...desk) @Get("receptionist") receptionist(@CurrentUser() a: Actor) {
    return this.s.dashboard(a, "receptionist");
  }
  @Roles(...hosts) @Get("staff") staff(@CurrentUser() a: Actor) {
    return this.s.dashboard(a, "staff");
  }
}
