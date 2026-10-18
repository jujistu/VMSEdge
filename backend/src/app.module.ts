import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import {
  ErrorFilter,
  JwtGuard,
  RateGuard,
  ResponseInterceptor,
  RolesGuard,
} from "./common/http";
import { CONFIG, configuration } from "./config/config";
import { DatabaseModule } from "./infrastructure/database";
import { CryptoService, Journal } from "./infrastructure/services";
import {
  AuthenticationEmailDelivery,
  InAppDelivery,
  OutboxWorker,
} from "./infrastructure/worker.service";
import {
  EmailAutomation,
  OperationalEmailDelivery,
} from "./infrastructure/email-automation";
import { AnalyticsModule } from "./modules/analytics.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { AuthModule } from "./modules/auth";
import { BlacklistModule } from "./modules/blacklist/blacklist.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { HealthModule } from "./modules/health/health.module";
import { InvitationsModule } from "./modules/invitations/invitations.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { UsersModule } from "./modules/users/users.module";
import { VisitorRequestsModule } from "./modules/visitor-requests/visitor-requests.module";
import { VisitorsModule } from "./modules/visitors/visitors.module";
import { VisitsModule } from "./modules/visits/visits.module";

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: configuration }],
  exports: [CONFIG],
})
export class ConfigurationModule {}
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [CryptoService, Journal],
  exports: [CryptoService, Journal],
})
export class InfrastructureModule {}
@Module({
  imports: [VisitsModule, AnalyticsModule],
  providers: [
    InAppDelivery,
    AuthenticationEmailDelivery,
    OperationalEmailDelivery,
    EmailAutomation,
    OutboxWorker,
  ],
  exports: [OutboxWorker, EmailAutomation],
})
export class WorkerModule {}
@Module({
  imports: [
    ConfigurationModule,
    InfrastructureModule,
    AuthModule,
    WorkerModule,
    UsersModule,
    DepartmentsModule,
    VisitorsModule,
    VisitsModule,
    InvitationsModule,
    VisitorRequestsModule,
    BlacklistModule,
    NotificationsModule,
    DashboardModule,
    ReportsModule,
    AuditLogsModule,
    SettingsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
