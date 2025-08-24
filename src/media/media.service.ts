import { randomBytes } from "crypto";
import { publicUrlForKey, StorageConfig } from "../config/storage";
import { PresignRequest, PresignResponse } from "./media.dto";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { s3 } from "./s3.client";

const safeName = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9.\-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$|^\.+/g, "");

export class MediaService {
    async presignUpload(req: PresignRequest): Promise<PresignResponse> {
        if (!StorageConfig.allowedContentTypes.includes(req.contentType)) {
            throw new Error("unsupported contentType");
        }

        const maxBytes = StorageConfig.maxSizeMB * 1024 * 1024;
        const uid = randomBytes(8).toString("base64url");

        const keyPrefix =
            req.purpose === "productImage"
                ? `products/${req.tenantId}/${req.productId ?? uid}`
                : `${req.purpose}/${req.tenantId}/${uid}`;

        const key = `${keyPrefix}/${safeName(req.filename)}`;

        const { url, fields } = await createPresignedPost(s3, {
            Bucket: StorageConfig.bucket,
            Key: key,
            Conditions: [
                ["content-length-range", 0, maxBytes],
                ["eq", "$Content-Type", req.contentType],
                ["eq", "$key", key],
            ],
            Fields: { "Content-Type": req.contentType },
            Expires: StorageConfig.presignExpiresSec,
        });

        return {
            upload: { url, fields, maxBytes },
            asset: { key, url: publicUrlForKey(key) },
        };
    }
}
