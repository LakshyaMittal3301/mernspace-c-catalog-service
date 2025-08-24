import { S3Client } from "@aws-sdk/client-s3";
import { StorageConfig } from "../config/storage";

export const s3 = new S3Client({
    region: StorageConfig.region,
    credentials:
        StorageConfig.accessKeyId && StorageConfig.secretAccessKey
            ? { accessKeyId: StorageConfig.accessKeyId, secretAccessKey: StorageConfig.secretAccessKey }
            : undefined,
});
