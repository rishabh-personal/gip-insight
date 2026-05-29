import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SyncGapService } from './sync-gap.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DEFAULT_INVOICE_EVENT_CODE } from '../config/event-recon-config';

@ApiTags('Sync Gap')
@Controller('api/dashboard/enterprises/:ssoEnterpriseId/sync-gap')
export class SyncGapController {
  constructor(private readonly svc: SyncGapService) {}

  @Post('retrigger')
  @ApiOperation({ summary: 'Increment sync_status on selected invoices to re-emit Debezium events — batches of 1000' })
  async retrigger(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Body() body: { invoiceIds: string[] },
  ) {
    const result = await this.svc.retriggerInvoices(ssoEnterpriseId, body.invoiceIds);
    return { data: result };
  }

  @Get('pending')
  @ApiOperation({ summary: 'Source records captured by GIP but stuck in pending/processing state — eligible for re-trigger' })
  @ApiQuery({ name: 'eventCode', required: false, description: `Event code from EVENT_SOURCE_CONFIGS. Defaults to ${DEFAULT_INVOICE_EVENT_CODE}` })
  @ApiQuery({ name: 'connectorId', required: false, description: 'Restrict pending jobs to a specific connector' })
  async pendingInvoices(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
    @Query('eventCode') eventCode?: string,
    @Query('connectorId') connectorId?: string,
  ) {
    return this.svc.getPendingInvoices(ssoEnterpriseId, pagination.fromDate, pagination.toDate, { eventCode, connectorId });
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Per-invoice timeline: Zwing source row enriched with GIP job status + sync delay (IST→UTC aware)' })
  @ApiQuery({ name: 'eventCode', required: false, description: `Event code from EVENT_SOURCE_CONFIGS. Defaults to ${DEFAULT_INVOICE_EVENT_CODE}` })
  @ApiQuery({ name: 'transactionType', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'connectorId', required: false, description: 'Filter GIP jobs by connector — restricts delay/status to jobs belonging to this connector only' })
  async invoiceTimeline(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
    @Query('eventCode') eventCode?: string,
    @Query('transactionType') transactionType?: string,
    @Query('storeId') storeId?: string,
    @Query('connectorId') connectorId?: string,
  ) {
    return this.svc.getInvoiceTimeline(ssoEnterpriseId, pagination.fromDate, pagination.toDate, {
      eventCode,
      transactionType,
      storeId,
      connectorId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Source (Zwing) vs GIP reconciliation — missing / failed / success breakdown per event type' })
  @ApiQuery({ name: 'eventCode', required: false, description: `Event code from EVENT_SOURCE_CONFIGS. Defaults to ${DEFAULT_INVOICE_EVENT_CODE}` })
  @ApiQuery({ name: 'transactionType', required: false, enum: ['sales', 'return'], description: 'Invoice-specific: filter by transaction type' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Invoice-specific: filter by store ID' })
  @ApiQuery({ name: 'connectorId', required: false, description: 'Restrict GIP job lookups to a specific connector — scopes missing/failed counts to that connector only' })
  async syncGap(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
    @Query('eventCode') eventCode?: string,
    @Query('transactionType') transactionType?: string,
    @Query('storeId') storeId?: string,
    @Query('connectorId') connectorId?: string,
  ) {
    return this.svc.getSyncGap(ssoEnterpriseId, pagination.fromDate, pagination.toDate, {
      eventCode,
      transactionType,
      storeId,
      connectorId,
    });
  }
}
