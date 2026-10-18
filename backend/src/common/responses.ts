import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, VisitStatus } from './domain';
export class PersonResponse {
  @ApiProperty() id!: string;
  @ApiProperty() visitorId!: string;
  @ApiProperty() firstName!: string;
  @ApiPropertyOptional() lastName?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() company?: string;
}
export class UserResponse {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiPropertyOptional() departmentId?: string;
  @ApiProperty() version!: number;
}
export class VisitResponse {
  @ApiProperty() id!: string;
  @ApiProperty() visitorId!: string;
  @ApiProperty() hostId!: string;
  @ApiProperty() departmentId!: string;
  @ApiPropertyOptional() invitationId?: string;
  @ApiPropertyOptional() visitorRequestId?: string;
  @ApiProperty({ enum: VisitStatus }) status!: VisitStatus;
  @ApiProperty() version!: number;
  @ApiProperty() purpose!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ format: 'date-time' }) expectedArrivalAt!: string;
  @ApiProperty({ format: 'date-time' }) expectedDepartureAt!: string;
  @ApiPropertyOptional({ format: 'date-time' }) actualCheckInAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) actualCheckOutAt?: string;
  @ApiProperty({ type: PersonResponse }) visitor!: PersonResponse;
  @ApiProperty({ type: 'object', additionalProperties: true }) host!: object;
  @ApiProperty({ type: 'object', additionalProperties: true })
  department!: object;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
  @ApiProperty() canEditVisit!: boolean;
  @ApiProperty() canEditInvitation!: boolean;
  @ApiProperty() numberOfGuests!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  snapshot!: object;
}
export class ResponseMeta {
  @ApiProperty() requestId!: string;
  @ApiPropertyOptional() page?: number;
  @ApiPropertyOptional() limit?: number;
  @ApiPropertyOptional() total?: number;
  @ApiPropertyOptional() totalPages?: number;
  @ApiPropertyOptional() asOf?: string;
}
export class VisitListResponse {
  @ApiProperty({ type: [VisitResponse] }) data!: VisitResponse[];
  @ApiProperty({ type: ResponseMeta }) meta!: ResponseMeta;
}
export class VisitEnvelope {
  @ApiProperty({ type: VisitResponse }) data!: VisitResponse;
  @ApiProperty({ type: ResponseMeta }) meta!: ResponseMeta;
}
export class ErrorResponse {
  @ApiProperty({
    example: { code: 'VERSION_CONFLICT', message: 'VERSION_CONFLICT' },
    type: 'object',
    additionalProperties: true,
  })
  error!: object;
  @ApiProperty({ type: ResponseMeta }) meta!: ResponseMeta;
}
