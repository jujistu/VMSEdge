import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiParam, ApiTags } from "@nestjs/swagger";
import { Actor, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { AnalyticsService } from "../analytics.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("reports")
@ApiBearerAuth()
@Roles(...all)
@Controller("reports")
export class ReportsController {
  constructor(private s: AnalyticsService) {}
  @Get("export.csv") export(
    @CurrentUser() a: Actor,
    @Query() q: D.VisitQueryDto,
    @Res() res: any,
  ) {
    return this.s.export(a, q, res);
  }
  @ApiParam({
    name: "report",
    enum: [
      "daily-visitors",
      "weekly-visitors",
      "monthly-visitors",
      "by-department",
      "by-host",
      "by-company",
      "average-duration",
      "peak-hours",
      "currently-checked-in",
      "visitor-history",
    ],
  })
  @Get(":report")
  report(
    @CurrentUser() a: Actor,
    @Param("report") report: string,
    @Query() q: D.VisitQueryDto,
  ) {
    return this.s.report(a, report, q);
  }
}
