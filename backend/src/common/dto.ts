import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Role, VisitStatus, VisitorType } from './domain';
const trim = ({ value }: any) =>
  typeof value === 'string' ? value.trim() : value;
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'createdAt',
    'updatedAt',
    'firstName',
    'name',
    'expectedArrivalAt',
    'actualCheckInAt',
    'actualCheckOutAt',
    'timestamp',
  ])
  sortBy = 'createdAt';
  @ApiPropertyOptional() @IsIn(['asc', 'desc']) sortOrder = 'desc';
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 100) q?: string;
}
export class VisitQueryDto extends PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  groupParent?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  eligible?: boolean;
  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['INVITATION', 'WALK_IN'])
  source?: string;
  @ApiPropertyOptional({ enum: VisitorType })
  @IsOptional()
  @IsEnum(VisitorType)
  visitorType?: VisitorType;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() visitorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() hostId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() departmentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
  @ApiPropertyOptional()
  @IsIn([
    'expectedArrivalAt',
    'actualCheckInAt',
    'actualCheckOutAt',
    'createdAt',
  ])
  dateField = 'expectedArrivalAt';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  receptionWaiting?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'daily-visitors',
    'weekly-visitors',
    'monthly-visitors',
    'by-department',
    'by-host',
    'by-company',
    'average-duration',
    'peak-hours',
    'currently-checked-in',
    'visitor-history',
  ])
  report?: string;
}
export class AuditQueryDto extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() userId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resource?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() resourceId?: string;
}
export class LoginDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty() @IsString() @Length(1, 128) password!: string;
}
export class ForgotDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class ResetDto {
  @ApiProperty() @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
  @ApiProperty() @IsString() @Length(12, 128) newPassword!: string;
}
export class ChangePasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword!: string;
  @ApiProperty() @IsString() @Length(12, 128) newPassword!: string;
}
export class ProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 30)
  phone?: string;
}
export class CreateUserDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(100) lastName!: string;
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 30)
  phone?: string;
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 50)
  employeeId!: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() departmentId?: string;
}
export class VersionDto {
  @ApiProperty() @IsInt() @Min(0) version!: number;
}
export class ReasonDto extends VersionDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 2000) reason!: string;
}
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty() @IsInt() @Min(0) version!: number;
}
export class UserStatusDto extends ReasonDto {
  @ApiProperty() @IsIn(['ACTIVE', 'DISABLED']) status!: string;
}
export class CreateDepartmentDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiProperty() @IsInt() @Min(0) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: string;
}
export class CreateVisitorDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 30)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  company?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'OTHER'])
  idType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  idNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistrationNumber?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemsCarried?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
export class UpdateVisitorDto extends PartialType(CreateVisitorDto) {
  @ApiProperty() @IsInt() @Min(0) version!: number;
}
export class VisitorStatusDto extends VersionDto {
  @ApiProperty() @IsIn(['ACTIVE', 'ARCHIVED']) status!: string;
}
export class VisitorSelectionDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() visitorId?: string;
  @ApiPropertyOptional({ type: CreateVisitorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVisitorDto)
  visitor?: CreateVisitorDto;
}
export class CreateInvitationDto extends VisitorSelectionDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() hostId?: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 500) purpose!: string;
  @ApiProperty({ enum: VisitorType })
  @IsEnum(VisitorType)
  visitorType!: VisitorType;
  @ApiProperty()
  @IsString()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  expectedArrivalAt!: string;
  @ApiProperty()
  @IsString()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  expectedDepartureAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() draft?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() primaryVisitId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
export class CreateRequestDto extends VisitorSelectionDto {
  @ApiProperty() @IsMongoId() hostId!: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 500) purpose!: string;
  @ApiProperty({ enum: VisitorType })
  @IsEnum(VisitorType)
  visitorType!: VisitorType;
  @ApiProperty()
  @IsString()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  expectedDepartureAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() primaryVisitId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistrationNumber?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemsCarried?: string[];
}
export class UpdateInvitationDto extends VersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  purpose?: string;
  @ApiPropertyOptional({ enum: VisitorType })
  @IsOptional()
  @IsEnum(VisitorType)
  visitorType?: VisitorType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  expectedArrivalAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  expectedDepartureAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
export class UpdateVisitDto extends VersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistrationNumber?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemsCarried?: string[];
}
export class CreateBlacklistDto {
  @ApiProperty() @IsMongoId() visitorId!: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 2000) reason!: string;
}
export class BlacklistCheckDto {
  @ApiProperty() @IsMongoId() visitorId!: string;
}
export class SettingsDto extends VersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  organizationName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  earlyArrivalMinutes?: number;
}
