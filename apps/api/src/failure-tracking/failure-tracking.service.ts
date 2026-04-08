import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FailureCategory } from './failure-category.schema';
import { FailureCase, FailureStatus } from './failure-case.schema';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCategoryDto {
  name: string;
  description?: string;
  color?: string;
  connectorName?: string | null;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  color?: string;
  connectorName?: string | null;
  isActive?: boolean;
}

export interface CreateCaseDto {
  categoryId: string;
  ssoEnterpriseId: string;
  enterpriseName?: string;
  connectorId?: string | null;
  connectorName?: string | null;
  refDocNo?: string | null;
  dipJobId?: string | null;
  notes?: string;
}

export interface UpdateCaseDto {
  categoryId?: string;
  notes?: string;
  status?: FailureStatus;
  resolution?: string;
}

export interface ListCasesFilter {
  page?: number;
  limit?: number;
  status?: FailureStatus;
  ssoEnterpriseId?: string;
  connectorId?: string;
  categoryId?: string;
  search?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class FailureTrackingService {
  constructor(
    @InjectModel(FailureCategory.name, 'insights')
    private readonly categoryModel: Model<FailureCategory>,
    @InjectModel(FailureCase.name, 'insights')
    private readonly caseModel: Model<FailureCase>,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(connectorName?: string) {
    const filter: any = { isActive: true };
    if (connectorName) {
      filter.$or = [{ connectorName: null }, { connectorName }];
    }
    return this.categoryModel.find(filter).sort({ connectorName: 1, name: 1 }).lean();
  }

  async createCategory(dto: CreateCategoryDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const existing = await this.categoryModel.findOne({
      name: dto.name.trim(),
      connectorName: dto.connectorName ?? null,
    });
    if (existing) throw new BadRequestException('Category with this name already exists for this connector');
    return this.categoryModel.create({
      name: dto.name.trim(),
      description: dto.description ?? '',
      color: dto.color ?? '#6b7280',
      connectorName: dto.connectorName ?? null,
      isActive: true,
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const doc = await this.categoryModel.findById(id);
    if (!doc) throw new NotFoundException('Category not found');
    Object.assign(doc, dto);
    return doc.save();
  }

  async deleteCategory(id: string) {
    const inUse = await this.caseModel.exists({ categoryId: new Types.ObjectId(id) });
    if (inUse) throw new BadRequestException('Cannot delete — category is used by existing cases. Deactivate instead.');
    await this.categoryModel.findByIdAndDelete(id);
    return { deleted: true };
  }

  // ── Cases ──────────────────────────────────────────────────────────────────

  async listCases(filter: ListCasesFilter = {}) {
    const { page = 1, limit = 50, status, ssoEnterpriseId, connectorId, categoryId, search } = filter;
    const match: any = {};
    if (status) match.status = status;
    if (ssoEnterpriseId) match.ssoEnterpriseId = ssoEnterpriseId;
    if (connectorId) match.connectorId = connectorId;
    if (categoryId) match.categoryId = new Types.ObjectId(categoryId);
    if (search) {
      match.$or = [
        { refDocNo: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { enterpriseName: { $regex: search, $options: 'i' } },
        { connectorName: { $regex: search, $options: 'i' } },
        { categoryName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [cases, total] = await Promise.all([
      this.caseModel.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.caseModel.countDocuments(match),
    ]);
    return { data: cases, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createCase(dto: CreateCaseDto) {
    const category = await this.categoryModel.findById(dto.categoryId).lean();
    if (!category) throw new NotFoundException('Category not found');

    return this.caseModel.create({
      categoryId: new Types.ObjectId(dto.categoryId),
      categoryName: category.name,
      ssoEnterpriseId: dto.ssoEnterpriseId,
      enterpriseName: dto.enterpriseName ?? '',
      connectorId: dto.connectorId ?? null,
      connectorName: dto.connectorName ?? null,
      refDocNo: dto.refDocNo ?? null,
      dipJobId: dto.dipJobId ?? null,
      notes: dto.notes ?? '',
      status: 'open',
      occurrenceCount: 1,
    });
  }

  async updateCase(id: string, dto: UpdateCaseDto) {
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');

    if (dto.categoryId) {
      const cat = await this.categoryModel.findById(dto.categoryId).lean();
      if (!cat) throw new NotFoundException('Category not found');
      doc.categoryId = new Types.ObjectId(dto.categoryId);
      doc.categoryName = cat.name;
    }
    if (dto.notes !== undefined) doc.notes = dto.notes;
    if (dto.status) {
      doc.status = dto.status;
      if (dto.status === 'resolved' && !doc.resolvedAt) doc.resolvedAt = new Date();
      if (dto.status !== 'resolved') doc.resolvedAt = null;
    }
    if (dto.resolution !== undefined) doc.resolution = dto.resolution;
    return doc.save();
  }

  async incrementOccurrence(id: string) {
    const doc = await this.caseModel.findByIdAndUpdate(
      id,
      { $inc: { occurrenceCount: 1 } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Case not found');
    return doc;
  }

  async deleteCase(id: string) {
    await this.caseModel.findByIdAndDelete(id);
    return { deleted: true };
  }

  // ── Summary / analytics ────────────────────────────────────────────────────

  async getSummary() {
    const [byCategory, byConnector, byStatus, byEnterprise, recent] = await Promise.all([
      // Count per category
      this.caseModel.aggregate([
        { $group: { _id: { categoryId: '$categoryId', categoryName: '$categoryName' }, count: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),

      // Count per connector
      this.caseModel.aggregate([
        { $match: { connectorName: { $ne: null } } },
        { $group: { _id: '$connectorName', count: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      // Count per status
      this.caseModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Count per enterprise (top 20)
      this.caseModel.aggregate([
        { $group: { _id: { ssoEnterpriseId: '$ssoEnterpriseId', enterpriseName: '$enterpriseName' }, count: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      // Last 5 open cases
      this.caseModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[s._id] = s.count;

    return {
      totals: {
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
        open: statusMap['open'] ?? 0,
        investigating: statusMap['investigating'] ?? 0,
        resolved: statusMap['resolved'] ?? 0,
        wont_fix: statusMap['wont_fix'] ?? 0,
      },
      byCategory: byCategory.map((r) => ({
        categoryId: r._id.categoryId,
        categoryName: r._id.categoryName,
        count: r.count,
        open: r.open,
      })),
      byConnector: byConnector.map((r) => ({ connectorName: r._id, count: r.count, open: r.open })),
      byEnterprise: byEnterprise.map((r) => ({
        ssoEnterpriseId: r._id.ssoEnterpriseId,
        enterpriseName: r._id.enterpriseName,
        count: r.count,
        open: r.open,
      })),
      recentOpen: recent,
    };
  }
}
