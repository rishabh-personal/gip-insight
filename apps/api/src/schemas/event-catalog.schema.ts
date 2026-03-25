import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'events', timestamps: false })
export class EventCatalog extends Document {
  @Prop({ type: Types.ObjectId }) appId: Types.ObjectId;
  @Prop() name: string;
  @Prop() eventCode: string;
  @Prop() direction: string; // inbound | outbound
  @Prop() refDocPath: string;
  @Prop() eventCodePath: string;
  @Prop({ type: Object }) listenerConfig: { kafkaTopicName?: string };
  @Prop() deletedOn: Date;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const EventCatalogSchema = SchemaFactory.createForClass(EventCatalog);
EventCatalogSchema.index({ appId: 1 });
EventCatalogSchema.index({ eventCode: 1 });
