import "server-only";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertValidKey, attachmentDisposition } from "./keys";
import {
  StorageConflictError,
  StorageError,
  StorageNotFoundError,
  type PutOptions,
  type SignedUrlOptions,
  type StorageProvider,
} from "./types";

type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for S3-compatible services such as Cloudflare R2 or Backblaze B2. */
  endpoint?: string;
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "";
}

function httpStatus(error: unknown): number {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return 0;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return 0;
  return Number(metadata.httpStatusCode ?? 0);
}

function isMissing(error: unknown): boolean {
  const name = errorName(error);
  return name === "NoSuchKey" || name === "NotFound" || httpStatus(error) === 404;
}

/** Stores files in any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2). */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.endpoint !== undefined,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Uint8Array, options: PutOptions): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType,
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (httpStatus(error) === 412 || errorName(error) === "PreconditionFailed") {
        throw new StorageConflictError(key);
      }
      throw new StorageError("S3 upload failed", { cause: error });
    }
  }

  async get(key: string): Promise<Uint8Array> {
    assertValidKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw new StorageNotFoundError(key);
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (error instanceof StorageNotFoundError) throw error;
      if (isMissing(error)) throw new StorageNotFoundError(key);
      throw new StorageError("S3 download failed", { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new StorageError("S3 exists check failed", { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new StorageError("S3 delete failed", { cause: error });
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    assertValidKey(fromKey);
    assertValidKey(toKey);
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: toKey,
          CopySource: `${this.bucket}/${fromKey}`,
        }),
      );
    } catch (error) {
      if (isMissing(error)) throw new StorageNotFoundError(fromKey);
      throw new StorageError("S3 copy failed", { cause: error });
    }
  }

  async getSignedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: options.downloadName
        ? attachmentDisposition(options.downloadName)
        : "attachment",
    });
    try {
      return await getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
    } catch (error) {
      throw new StorageError("S3 signed URL failed", { cause: error });
    }
  }
}
