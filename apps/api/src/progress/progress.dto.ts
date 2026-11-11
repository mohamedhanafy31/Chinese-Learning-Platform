import {
  reportProgressRequestSchema,
  type ReportProgressRequest,
} from '@app/shared';

export class ReportProgressDto implements ReportProgressRequest {
  static readonly schema = reportProgressRequestSchema;

  declare segments: ReportProgressRequest['segments'];
  declare positionSec: ReportProgressRequest['positionSec'];
  declare durationSec?: ReportProgressRequest['durationSec'];
}
