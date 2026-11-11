import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role, type PublicUser } from '@app/shared';

import { BillingReportService } from './billing-report.service';
import { AdminOrdersQueryDto, CheckoutDto } from './billing.dto';
import { BillingService } from './billing.service';
import type { CheckoutResponse, OrderSummary } from './billing.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';

function checkoutTracker(request: Record<string, unknown>): string {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.access_token;
  if (typeof token !== 'string') return '<missing-user>';
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : '<missing-user>';
  } catch {
    return '<invalid-user>';
  }
}

@Controller('billing')
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get('availability')
  @Public()
  availability(): { available: boolean } {
    return this.billing.availability();
  }

  @Post('checkout')
  @Roles(Role.STUDENT, Role.ADMIN)
  @Throttle({
    default: { limit: 5, ttl: 60_000, getTracker: checkoutTracker },
  })
  checkout(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(CheckoutDto.schema)) input: CheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.billing.checkout(user, input);
  }

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
