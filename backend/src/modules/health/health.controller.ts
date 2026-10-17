import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { fail, Role } from "../../common/domain";
import { Public, secretEqual } from "../../common/http";
import { CONFIG, Configuration } from "../../config/config";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private r: RecordsService,
    @Inject(CONFIG) private c: Configuration,
  ) {}
  @Public() @Get("live") live() {
    return { status: "ok" };
  }
  @Public() @Get("ready") async ready(
    @Headers("x-readiness-token") token: string,
  ) {
    if (
      this.c.production &&
      (!token || !secretEqual(token, this.c.readinessToken!))
    )
      fail("FORBIDDEN", 403);
    return this.r.readiness();
  }
}
