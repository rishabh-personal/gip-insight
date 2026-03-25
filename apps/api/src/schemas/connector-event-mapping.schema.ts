import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'connectorEventMappings', timestamps: false })
export class ConnectorEventMapping extends Document {
  @Prop({ type: Types.ObjectId }) connectorId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) outboundEventId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) inboundEventId: Types.ObjectId;
  @Prop() isEnabled: boolean;
  @Prop() isRetryable: boolean;
  @Prop() isSequential: boolean;
  @Prop() priority: number;
  @Prop({ type: Object }) filters: any;
  @Prop({ type: [Object] }) tasks: any[];
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const ConnectorEventMappingSchema = SchemaFactory.createForClass(ConnectorEventMapping);
ConnectorEventMappingSchema.index({ connectorId: 1 });
