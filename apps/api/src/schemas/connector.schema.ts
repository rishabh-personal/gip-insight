import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'connectors', timestamps: false })
export class Connector extends Document {
  @Prop() name: string;
  @Prop({ type: Types.ObjectId }) outboundAppId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) inboundAppId: Types.ObjectId;
  @Prop() ssoEnterpriseId: string;
  @Prop() isEnabled: boolean;
  @Prop() deletedOn: Date;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const ConnectorSchema = SchemaFactory.createForClass(Connector);
ConnectorSchema.index({ ssoEnterpriseId: 1 });
