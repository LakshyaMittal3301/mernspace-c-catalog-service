import config from "config";

type S3Cfg = {
    region: string;
    bucket: string;
    publicBaseUrl?: string;
    maxSizeMB: number;
    allowedContentTypes: string[];
    presignExpiresSec: number;
    accessKeyId?: string;
    secretAccessKey?: string;
};

const raw = config.get<S3Cfg>("storage.s3");

export const StorageConfig = {
    ...raw,
    resolvedBaseUrl:
        raw.publicBaseUrl ??
        (raw.region === "us-east-1"
            ? `https://${raw.bucket}.s3.amazonaws.com`
            : `https://${raw.bucket}.s3.${raw.region}.amazonaws.com`),
};

export const publicUrlForKey = (key: string) => `${StorageConfig.resolvedBaseUrl}/${encodeURI(key)}`;
