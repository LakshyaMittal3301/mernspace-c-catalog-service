import { PresignPurpose } from "./media.types";

export interface PresignRequest {
    purpose: PresignPurpose;
    tenantId: string;
    filename: string;
    contentType: string;
    productId?: string;
}
export interface PresignResponse {
    upload: { url: string; fields: Record<string, string>; maxBytes: number };
    asset: { key: string; url: string };
}
