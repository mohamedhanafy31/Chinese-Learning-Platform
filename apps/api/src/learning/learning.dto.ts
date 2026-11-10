import {
  adminStudentsQuerySchema,
  grantEnrollmentRequestSchema,
  revokeEnrollmentRequestSchema,
  type AdminStudentsQuery,
  type GrantEnrollmentRequest,
  type RevokeEnrollmentRequest,
} from '@app/shared';

export class AdminStudentsQueryDto implements AdminStudentsQuery {
  static readonly schema = adminStudentsQuerySchema;

  declare query: AdminStudentsQuery['query'];
  declare page: AdminStudentsQuery['page'];
  declare pageSize: AdminStudentsQuery['pageSize'];
}

export class GrantEnrollmentDto implements GrantEnrollmentRequest {
  static readonly schema = grantEnrollmentRequestSchema;

  declare levelId: GrantEnrollmentRequest['levelId'];
}

export class RevokeEnrollmentDto implements RevokeEnrollmentRequest {
  static readonly schema = revokeEnrollmentRequestSchema;

  declare reason: RevokeEnrollmentRequest['reason'];
}
