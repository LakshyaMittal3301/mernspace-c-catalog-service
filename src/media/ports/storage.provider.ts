export interface StorageProvider {
    presignPost(params: {
        key: string;
        contentType: string;
        maxBytes: number;
        expiresSec: number;
    }): Promise<{ url: string; fields: Record<string, string> }>;
    publicUrlForKey(key: string): string;
}
