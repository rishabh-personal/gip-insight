import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query,
} from '@nestjs/common';
import { FailureTrackingService, CreateCategoryDto, UpdateCategoryDto, CreateCaseDto, UpdateCaseDto } from './failure-tracking.service';

@Controller('api/dashboard/failure-tracking')
export class FailureTrackingController {
  constructor(private readonly svc: FailureTrackingService) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  @Get('categories')
  listCategories(@Query('connectorName') connectorName?: string) {
    return this.svc.listCategories(connectorName);
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.svc.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.svc.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.svc.deleteCategory(id);
  }

  // ── Cases ──────────────────────────────────────────────────────────────────

  @Get('cases')
  listCases(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('ssoEnterpriseId') ssoEnterpriseId?: string,
    @Query('connectorId') connectorId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listCases({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      status: status as any,
      ssoEnterpriseId,
      connectorId,
      categoryId,
      search,
    });
  }

  @Post('cases')
  createCase(@Body() dto: CreateCaseDto) {
    return this.svc.createCase(dto);
  }

  @Patch('cases/:id')
  updateCase(@Param('id') id: string, @Body() dto: UpdateCaseDto) {
    return this.svc.updateCase(id, dto);
  }

  @Post('cases/:id/increment')
  incrementOccurrence(@Param('id') id: string) {
    return this.svc.incrementOccurrence(id);
  }

  @Delete('cases/:id')
  deleteCase(@Param('id') id: string) {
    return this.svc.deleteCase(id);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  @Get('summary')
  getSummary() {
    return this.svc.getSummary();
  }
}
