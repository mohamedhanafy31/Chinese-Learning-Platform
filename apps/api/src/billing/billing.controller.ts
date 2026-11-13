import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Role, type PublicUser } from '@app/shared';

import { BillingReportService } from './billing-report.service';
import { AdminOrdersQueryDto } from './billing.dto';
import { BillingService } from './billing.service';
import type { OrderSummary } from './billing.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('billing')
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get('orders')
  list(@CurrentUser() user: PublicUser): Promise<{ orders: OrderSummary[] }> {
    return this.billing.listOwnOrders(user.id);
  }

  @Get('orders/:id')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<OrderSummary> {
    return this.billing.getOrder(id, user);
  }
}

@Controller('admin/orders')
@Roles(Role.ADMIN)
export class AdminOrdersController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminOrdersQueryDto.schema))
    query: AdminOrdersQueryDto,
  ) {
    return this.billing.listAdmin(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.billing.getAdminOrder(id);
  }
}

@Controller('admin/billing')
@Roles(Role.ADMIN)
export class AdminBillingController {
  constructor(
    @Inject(BillingReportService)
    private readonly reports: BillingReportService,
  ) {}

  @Get('report')
  report() {
    return this.reports.last24Hours();
  }
}
