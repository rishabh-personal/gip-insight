import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'enterprises', timestamps: false })
export class Enterprise extends Document {
  @Prop() ssoEnterpriseId: string;
  @Prop() tradeName: string;
  @Prop() legalName: string;
  @Prop() baCode: string;
  @Prop() email: string;
  @Prop() website: string;
  @Prop() timezone: string;
  @Prop() liveStatus: number;
  @Prop() draftStatus: number;
  @Prop() isTestEnterprise: boolean;
  @Prop({ type: Object }) meta: { zwingVId?: string };
  @Prop() deletedOn: Date;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const EnterpriseSchema = SchemaFactory.createForClass(Enterprise);
EnterpriseSchema.index({ ssoEnterpriseId: 1 }, { unique: true });
