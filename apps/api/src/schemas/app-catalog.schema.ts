import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'apps', timestamps: false })
export class AppCatalog extends Document {
  @Prop() name: string;
  @Prop() description: string;
  @Prop() refId: string;
  @Prop() accessType: string; // 'public' = global catalog | 'private' = enterprise-owned
  @Prop() ssoEnterpriseId: string; // only present on private (enterprise-specific) apps
  @Prop() isEnabled: boolean;
  @Prop() inboundEnabled: boolean;
  @Prop() outboundEnabled: boolean;
  @Prop() enrichment: boolean;
  @Prop() deletedOn: Date;
  @Prop() createdAt: Date;
  @Prop() updatedAt: Date;
}

export const AppCatalogSchema = SchemaFactory.createForClass(AppCatalog);
AppCatalogSchema.index({ ssoEnterpriseId: 1 });
