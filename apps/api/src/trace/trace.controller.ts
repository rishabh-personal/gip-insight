import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TraceService } from './trace.service';

@ApiTags('Trace')
@Controller('api/dashboard/trace')
export class TraceController {
  constructor(private readonly svc: TraceService) {}

  @Get()
  @ApiOperation({ summary: 'End-to-end invoice trace (STORY-007)' })
  @ApiQuery({ name: 'invoiceId', required: true })
  @ApiQuery({ name: 'ssoEnterpriseId', required: false })
  async trace(
    @Query('invoiceId') invoiceId: string,
    @Query('ssoEnterpriseId') ssoEnterpriseId?: string,
  ): Promise<any> {
    return this.svc.trace(invoiceId, ssoEnterpriseId);
  }
}
