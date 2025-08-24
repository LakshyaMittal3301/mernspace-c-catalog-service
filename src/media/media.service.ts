import { randomBytes } from "crypto";
import { StorageConfig } from "../config/storage";
import { PresignRequest, PresignResponse } from "./media.dto";
import { UnsupportedContentTypeError } from "./media.errors";
import { safeName } from "../common/utils";
import { StorageProvider } from "./ports/storage.provider";

const PurposeLimits: Record<string, { allowedContentTypes: string[]; maxSizeMB: number }> = {
    productImage: {
        allowedContentTypes: StorageConfig.allowedContentTypes,
        maxSizeMB: StorageConfig.maxSizeMB,
    },
};

export class MediaService {
    constructor(private storage: StorageProvider) {}

    async presignUpload(req: PresignRequest): Promise<PresignResponse> {
        const limits = PurposeLimits[req.purpose] ?? PurposeLimits.productImage;
        if (!limits.allowedContentTypes.includes(req.contentType)) {
            throw new UnsupportedContentTypeError(req.contentType);
        }

        const maxBytes = limits.maxSizeMB * 1024 * 1024;
        const uid = randomBytes(8).toString("base64url");

        const keyPrefix =
            req.purpose === "productImage"
                ? `products/${req.tenantId}/${req.productId ?? uid}`
                : `${req.purpose}/${req.tenantId}/${uid}`;

        const key = `${keyPrefix}/${safeName(req.filename)}`;

        const { url, fields } = await this.storage.presignPost({
            key,
            contentType: req.contentType,
            maxBytes,
            expiresSec: StorageConfig.presignExpiresSec,
        });

        return {
            upload: { url, fields, maxBytes },
            asset: { key, url: this.storage.publicUrlForKey(key) },
        };
    }
}
