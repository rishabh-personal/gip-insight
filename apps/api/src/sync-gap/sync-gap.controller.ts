import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SyncGapService } from './sync-gap.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Sync Gap')
@Controller('api/dashboard/enterprises/:ssoEnterpriseId/sync-gap')
export class SyncGapController {
  constructor(private readonly svc: SyncGapService) {}

  @Post('retrigger')
  @ApiOperation({ summary: 'Set sync_status=5 on selected invoices to re-emit Debezium events — batches of 1000' })
  async retrigger(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Body() body: { invoiceIds: string[] },
  ) {
    const result = await this.svc.retriggerInvoices(ssoEnterpriseId, body.invoiceIds);
    return { data: result };
  }

  @Get()
  @ApiOperation({ summary: 'Zwing vs GIP reconciliation — detect missed Debezium events (STORY-003)' })
  @ApiQuery({ name: 'transactionType', required: false, enum: ['sales', 'return'] })
  @ApiQuery({ name: 'storeId', required: false })
  async syncGap(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
    @Query('transactionType') transactionType?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.svc.getSyncGap(ssoEnterpriseId, pagination.fromDate, pagination.toDate, {
      transactionType,
      storeId,
    });
  }
}
