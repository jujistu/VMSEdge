import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Actor, oid, Role } from "../../common/domain";
import * as D from "../../common/dto";
import { CurrentUser, Roles } from "../../common/http";
import { RecordsService } from "../records.service";
const all = [Role.ADMIN, Role.RECEPTIONIST, Role.STAFF];
const desk = [Role.ADMIN, Role.RECEPTIONIST];
const hosts = [Role.ADMIN, Role.STAFF];
@ApiTags("notifications")
@ApiBearerAuth()
@Roles(...all)
@Controller("notifications")
export class NotificationsController {
  constructor(private r: RecordsService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: D.PageDto) {
    return this.r.page("notifications", { userId: oid(a.id) }, q);
  }
  @Get("unread-count") async unread(@CurrentUser() a: Actor) {
    return this.r.notificationUnread(a);
  }
  @Patch(":id/read") async read(
    @CurrentUser() a: Actor,
    @Param("id") id: string,
  ) {
    return this.r.notificationRead(a, id);
  }
  @Post("read-all") async all(@CurrentUser() a: Actor) {
    return this.r.notificationsReadAll(a);
  }
}
