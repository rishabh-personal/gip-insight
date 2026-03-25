import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobStatus = 'pending' | 'processing' | 'success' | 'failed';

@Schema({ collection: 'dipJobs', timestamps: false })
export class DipJob extends Document {
  @Prop({ type: Types.ObjectId }) connectorId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) ingressEventLogId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) connectorAppEventId: Types.ObjectId;
  @Prop() ssoEnterpriseId: string;
  @Prop({ type: Types.ObjectId }) outboundEventId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) inboundAppId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) outboundAppId: Types.ObjectId;
  @Prop() storeId: string;
  @Prop() refDocNo: string;
  @Prop() status: JobStatus;
  @Prop() error: string;
  @Prop() retryCount: number;
  @Prop() isRetryable: boolean;
  @Prop() inputDataPath: string;
  @Prop() transformedDataPath: string;
  @Prop() transactionDate: Date;
  @Prop({ type: [Object] }) timestamps: Array<{
    status: string;
    timestamp: Date;
    retryCount: number;
    error: string;
  }>;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const DipJobSchema = SchemaFactory.createForClass(DipJob);
DipJobSchema.index({ ssoEnterpriseId: 1, transactionDate: -1 });
DipJobSchema.index({ refDocNo: 1, ssoEnterpriseId: 1 });
DipJobSchema.index({ connectorId: 1, status: 1, transactionDate: -1 });
DipJobSchema.index({ status: 1, transactionDate: -1 });
DipJobSchema.index({ refDocNo: 1 });
