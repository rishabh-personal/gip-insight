import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DipJobsService } from './dip-jobs.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Jobs')
@Controller('api/dashboard')
export class DipJobsController {
  constructor(private readonly svc: DipJobsService) {}

  @Get('enterprises/:ssoEnterpriseId/jobs/summary')
  @ApiOperation({ summary: 'Job status summary for an enterprise (STORY-004)' })
  async summary(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.svc.getSummary(ssoEnterpriseId, pagination.fromDate, pagination.toDate);
  }

  @Get('enterprises/:ssoEnterpriseId/jobs/failed-summary')
  @ApiOperation({ summary: 'Async failed-job count + preview for one enterprise (per-row on Failed Jobs page)' })
  async failedSummary(
    @Param('ssoEnterpriseId') ssoEnterpriseId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.svc.getEnterpriseFailedSummary(
      ssoEnterpriseId,
      pagination.fromDate,
      pagination.toDate,
    );
  }

  @Get('jobs/failed')
  @ApiOperation({ summary: 'List failed jobs across all or one enterprise (STORY-005)' })
  @ApiQuery({ name: 'ssoEnterpriseId', required: false })
  @ApiQuery({ name: 'connectorId', required: false })
  @ApiQuery({ name: 'appId', required: false })
  async failedJobs(
    @Query() pagination: PaginationDto,
    @Query('ssoEnterpriseId') ssoEnterpriseId?: string,
    @Query('connectorId') connectorId?: string,
  ) {
    return this.svc.getFailedJobs({
      page: pagination.page,
      limit: pagination.limit,
      from: pagination.fromDate,
      to: pagination.toDate,
      ssoEnterpriseId,
      connectorId,
    });
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Job detail with task-level breakdown (STORY-006)' })
  async jobDetail(@Param('jobId') jobId: string) {
    return this.svc.getJobDetail(jobId);
  }

}
