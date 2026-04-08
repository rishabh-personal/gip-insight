import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * A reusable root-cause category (e.g. "API Timeout", "Auth Failure").
 * Can be scoped to a specific connector name or left global (connectorName = null).
 * Stored in the 'insights' connection, separate DB from GIP prod.
 */
@Schema({ timestamps: true, collection: 'failure_categories' })
export class FailureCategory extends Document {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) description: string;
  /** Hex colour for UI badge (e.g. "#ef4444"). Defaults to gray. */
  @Prop({ default: '#6b7280' }) color: string;
  /**
   * null  → category applies to all connectors
   * value → only relevant for this connector name
   */
  @Prop({ default: null, index: true }) connectorName: string | null;
  @Prop({ default: true }) isActive: boolean;
}

export const FailureCategorySchema = SchemaFactory.createForClass(FailureCategory);
