import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'dipJobTasks', timestamps: false })
export class DipJobTask extends Document {
  @Prop({ type: Types.ObjectId }) jobId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) eventTaskId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) parentId: Types.ObjectId;
  @Prop() name: string;
  @Prop() type: string; // filter | http | transform | enrichment
  @Prop() status: string;
  @Prop() retryCount: number;
  @Prop() error: string;
  @Prop() continueOnFailure: boolean;
  @Prop() httpMetadataPath: string;
  @Prop() inputDataPath: string;
  @Prop() outputDataPath: string;
  @Prop({ type: [Object] }) timestamps: Array<{
    status: string;
    timestamp: Date;
    retryCount: number;
    error: string;
  }>;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const DipJobTaskSchema = SchemaFactory.createForClass(DipJobTask);
DipJobTaskSchema.index({ jobId: 1 });
