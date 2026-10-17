import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, fail, oid, Role, safe } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { AnalyticsService } from "../analytics.service";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("departments")
@ApiBearerAuth()
@Controller("departments")
export class DepartmentsController {
  constructor(
    private r: RecordsService,
    private reports: AnalyticsService,
  ) {}
  @Roles(Role.ADMIN) @Post() create(
    @CurrentUser() a: Actor,
    @Body() d: D.CreateDepartmentDto,
  ) {
    return this.r.departmentCreate(a, d);
  }
  @Roles(...all) @Get() list(@CurrentUser() a: Actor, @Query() q: D.PageDto) {
    return this.r.page(
      "departments",
      a.role === Role.STAFF
        ? { _id: a.departmentId ? oid(a.departmentId) : null }
        : {},
      q,
    );
  }
  @Roles(...all) @Get(":id") async get(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    if (a.role === Role.STAFF && a.departmentId !== id)
      fail("RESOURCE_NOT_FOUND", 404);
    return safe(await this.r.get("departments", id));
  }
  @Roles(Role.ADMIN) @Patch(":id") update(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.UpdateDepartmentDto,
  ) {
    return this.r.departmentUpdate(a, id, d);
  }
  @Roles(Role.ADMIN) @Delete(":id") archive(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Body() d: D.VersionDto,
  ) {
    return this.r.departmentUpdate(a, id, { ...d, status: "ARCHIVED" });
  }
  @Roles(...desk) @Get(":id/staff") staff(
    @Param("id") id: string,
    @Query() q: D.PageDto,
  ) {
    return this.r.page(
      "users",
      { departmentId: oid(id), role: "STAFF", status: "ACTIVE" },
      q,
      { firstName: 1, lastName: 1, departmentId: 1 },
    );
  }
  @Roles(Role.ADMIN) @Get(":id/visitor-statistics") stats(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
    @Query() q: D.VisitQueryDto,
  ) {
    oid(id);
    return this.reports.report(
      a,
      "daily-visitors",
      Object.assign(q, { departmentId: id }),
    );
  }
}
