import { IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 25);
  }

  get fromDate(): Date {
    if (this.from) return new Date(this.from);
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return d;
  }

  get toDate(): Date {
    return this.to ? new Date(this.to) : new Date();
  }
}
