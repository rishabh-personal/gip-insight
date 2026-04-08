import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FailureStatus = 'open' | 'investigating' | 'resolved' | 'wont_fix';

/**
 * A single tracked failure occurrence. Every case is linked to a category
 * (root cause), records which enterprise + connector it came from, optionally
 * links back to the GIP DipJob, and tracks lifecycle (open → resolved).
 * Stored in the 'insights' connection, separate DB from GIP prod.
 */
@Schema({ timestamps: true, collection: 'failure_cases' })
export class FailureCase extends Document {
  /** Ref to FailureCategory._id in the insights DB */
  @Prop({ type: Types.ObjectId, required: true, index: true }) categoryId: Types.ObjectId;
  @Prop({ required: true }) categoryName: string;  // denormalised for query speed

  // ── Enterprise context ────────────────────────────────────────────────────
  @Prop({ required: true, index: true }) ssoEnterpriseId: string;
  @Prop({ default: '' }) enterpriseName: string;

  // ── Connector context ─────────────────────────────────────────────────────
  @Prop({ default: null, index: true }) connectorId: string | null;
  @Prop({ default: null }) connectorName: string | null;

  // ── Failure details ───────────────────────────────────────────────────────
  /** Invoice / document reference from Zwing (refDocNo) */
  @Prop({ default: null }) refDocNo: string | null;
  /** Optional link to the GIP DipJob _id (ObjectId as string) */
  @Prop({ default: null }) dipJobId: string | null;
  /** Free-text notes / error snippet */
  @Prop({ default: '' }) notes: string;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  @Prop({ default: 'open', index: true }) status: FailureStatus;
  /** How it was fixed — filled when status → resolved */
  @Prop({ default: '' }) resolution: string;
  @Prop({ default: null }) resolvedAt: Date | null;

  /** Number of times this same failure pattern has been observed (auto-incremented on log) */
  @Prop({ default: 1 }) occurrenceCount: number;
}

export const FailureCaseSchema = SchemaFactory.createForClass(FailureCase);

FailureCaseSchema.index({ ssoEnterpriseId: 1, status: 1 });
FailureCaseSchema.index({ connectorId: 1, status: 1 });
FailureCaseSchema.index({ categoryId: 1, status: 1 });
