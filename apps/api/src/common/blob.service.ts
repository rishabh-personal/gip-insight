import { Injectable, Logger } from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';

@Injectable()
export class BlobService {
  private readonly logger = new Logger(BlobService.name);
  private readonly client: BlobServiceClient | null;
  /** Optional fixed container override. When empty, the container is parsed from the blob path. */
  private readonly containerOverride: string;

  constructor() {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.containerOverride = (process.env.AZURE_STORAGE_CONTAINER || '').trim();

    if (connStr && !connStr.includes('YOUR_ACCOUNT') && !connStr.includes('YOUR_KEY')) {
      try {
        this.client = BlobServiceClient.fromConnectionString(connStr);
        this.logger.log('Azure Blob Storage client initialised');
      } catch (e: any) {
        this.logger.warn(`AZURE_STORAGE_CONNECTION_STRING is invalid — blob reads will return null: ${e?.message}`);
        this.client = null;
      }
    } else {
      this.logger.warn('AZURE_STORAGE_CONNECTION_STRING not configured — blob reads will return null');
      this.client = null;
    }
  }

  /**
   * Download a blob by path and return its content as a parsed JSON object
   * (or raw string if not valid JSON). Returns null if not configured or not found.
   *
   * Path resolution:
   *  - If AZURE_STORAGE_CONTAINER is set, use it as the container and treat blobPath as-is.
   *  - Otherwise, split blobPath on the first "/" — the first segment is the container name
   *    and the remainder is the blob name within that container.
   *    e.g. "dipv2/tenantId/connectorId/http/jobId"
   *         → container "dipv2", blob "tenantId/connectorId/http/jobId"
   */
  async read(blobPath: string): Promise<any> {
    if (!this.client || !blobPath) return null;

    let container: string;
    let blobName: string;

    if (this.containerOverride) {
      container = this.containerOverride;
      blobName  = blobPath;
    } else {
      const slash = blobPath.indexOf('/');
      if (slash === -1) {
        this.logger.warn(`Blob path "${blobPath}" has no "/" — cannot determine container`);
        return null;
      }
      container = blobPath.slice(0, slash);
      blobName  = blobPath.slice(slash + 1);
    }

    this.logger.debug(`Reading blob: container="${container}" blob="${blobName}"`);

    try {
      const containerClient = this.client.getContainerClient(container);
      const blobClient      = containerClient.getBlobClient(blobName);
      const download        = await blobClient.download();

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
      if (e?.statusCode === 404) {
        this.logger.debug(`Blob not found: container="${container}" blob="${blobName}"`);
        return null;
      }
      this.logger.warn(`Blob read failed — container="${container}" blob="${blobName}": ${e?.message}`);
      return null;
    }
  }
}
