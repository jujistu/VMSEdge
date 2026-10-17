import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { oid, Role, safe } from "../../common/domain";
import * as D from "../../common/dto";
import { Roles } from "../../common/http";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("audit-logs")
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private r: RecordsService) {}
  @Get() list(@Query() q: D.AuditQueryDto) {
    const filter: any = {};
    for (const field of ["userId", "resourceId"] as const)
      if (q[field]) filter[field] = oid(q[field]!);
    for (const field of ["action", "resource"] as const)
      if (q[field]) filter[field] = q[field];
    return this.r.page(
      "auditLogs",
      filter,
      Object.assign(q, { sortBy: "timestamp" }),
    );
  }
  @Get(":id") async get(@Param("id") id: string) {
    return safe(await this.r.get("auditLogs", id));
  }
}
