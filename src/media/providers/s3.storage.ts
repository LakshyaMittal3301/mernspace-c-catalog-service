import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { s3 } from "../s3.client";
import { StorageConfig, publicUrlForKey } from "../../config/storage";
import { StorageProvider } from "../ports/storage.provider";
import { MediaPolicyError } from "../media.errors";

export class S3StorageProvider implements StorageProvider {
    async presignPost(params: { key: string; contentType: string; maxBytes: number; expiresSec: number }) {
        try {
            const { url, fields } = await createPresignedPost(s3, {
                Bucket: StorageConfig.bucket,
                Key: params.key,
                Conditions: [
                    ["content-length-range", 0, params.maxBytes],
                    ["eq", "$Content-Type", params.contentType],
                    ["eq", "$key", params.key],
                ],
                Fields: { "Content-Type": params.contentType },
                Expires: params.expiresSec,
            });
            return { url, fields };
        } catch (e: any) {
            throw new MediaPolicyError(e?.message ?? "Failed to create presigned policy");
        }
    }
    publicUrlForKey(key: string) {
        return publicUrlForKey(key);
    }
}
