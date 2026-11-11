import { adminAuditQuerySchema, type AdminAuditQuery } from '@app/shared';

export class AdminAuditQueryDto implements AdminAuditQuery {
  static readonly schema = adminAuditQuerySchema;

  declare entity: AdminAuditQuery['entity'];
  declare entityId: AdminAuditQuery['entityId'];
  declare actorId: AdminAuditQuery['actorId'];
  declare actor: AdminAuditQuery['actor'];
  declare action: AdminAuditQuery['action'];
  declare from: AdminAuditQuery['from'];
  declare to: AdminAuditQuery['to'];
  declare page: AdminAuditQuery['page'];
  declare pageSize: AdminAuditQuery['pageSize'];
}
