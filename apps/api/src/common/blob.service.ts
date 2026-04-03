import { Injectable, Logger } from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';

@Injectable()
export class BlobService {
  private readonly logger = new Logger(BlobService.name);
  private readonly client: BlobServiceClient | null;
  private readonly container: string;

  constructor() {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.container = process.env.AZURE_STORAGE_CONTAINER || 'gip-data';

    if (connStr && !connStr.includes('YOUR_ACCOUNT')) {
      this.client = BlobServiceClient.fromConnectionString(connStr);
    } else {
      this.logger.warn('AZURE_STORAGE_CONNECTION_STRING not configured — blob reads will return null');
      this.client = null;
    }
  }

  /**
   * Download a blob by path and return its content as a parsed JSON object
   * (or raw string if not valid JSON). Returns null if not configured or not found.
   */
  async read(blobPath: string): Promise<any> {
    if (!this.client || !blobPath) return null;

    try {
      const containerClient = this.client.getContainerClient(this.container);
      const blobClient = containerClient.getBlobClient(blobPath);
      const download = await blobClient.download();
      const chunks: Buffer[] = [];
      for await (const chunk of download.readableStreamBody as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e: any) {
      if (e?.statusCode === 404) return null;
      this.logger.warn(`Blob read failed for "${blobPath}": ${e?.message}`);
      return null;
    }
  }
}
