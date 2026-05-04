import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EnterprisesService } from './enterprises.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Enterprises')
@Controller('api/dashboard/enterprises')
export class EnterprisesController {
  constructor(private readonly svc: EnterprisesService) {}

  @Get()
  @ApiOperation({ summary: 'List enterprises that have private apps in apps collection — fast, no metrics' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'connectorName', required: false, description: 'Filter to enterprises that have this exact connector name' })
  async list(
    @Query('search') search?: string,
    @Query('connectorName') connectorName?: string,
  ): Promise<any> {
    return this.svc.listEnterpriseStubs({ search, connectorName });
  }

  @Get('apps')
  @ApiOperation({ summary: 'List all unique apps used across connectors (for filter dropdown)' })
  async apps(): Promise<any> {
    const data = await this.svc.listApps();
    return { data };
  }

  @Get('connectors')
  @ApiOperation({ summary: 'List all unique connector names (for pin-as-tab dropdown)' })
  async connectors(): Promise<any> {
    const data = await this.svc.listConnectors();
    return { data };
  }

  @Get(':ssoEnterpriseId/metrics')
  @ApiOperation({ summary: 'Async metrics for a single enterprise — job stats + sync gap (STORY-001)' })
  @ApiQuery({ name: 'connectorName', required: false, description: 'Scope metrics to a single connector (connector-tab mode)' })
  async metrics(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
    @Query('connectorName') connectorName?: string,
  ): Promise<any> {
    const result = await this.svc.getEnterpriseMetrics(
      ssoEnterpriseId,
      pagination.fromDate,
      pagination.toDate,
      connectorName,
    );
    return { data: result };
  }

  @Get(':ssoEnterpriseId/event-recon')
  @ApiOperation({
    summary:
      'Per-outbound-event reconciliation summary — GIP job counts vs Zwing source counts across all connectors',
  })
  async eventRecon(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
  ): Promise<any> {
    const result = await this.svc.getEventReconSummary(
      ssoEnterpriseId,
      pagination.fromDate,
      pagination.toDate,
    );
    return { data: result };
  }

  @Get(':ssoEnterpriseId')
  @ApiOperation({ summary: 'Enterprise detail with connectors and app health (STORY-002)' })
  async detail(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
  ): Promise<any> {
    const result = await this.svc.getEnterpriseDetail(
      ssoEnterpriseId,
      pagination.fromDate,
      pagination.toDate,
    );
    if (!result) throw new NotFoundException('Enterprise not found');
    return { data: result };
  }
}
