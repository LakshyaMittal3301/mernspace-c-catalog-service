export class UnsupportedContentTypeError extends Error {
    constructor(ct: string) {
        super(`unsupported contentType: ${ct}`);
        this.name = "UnsupportedContentTypeError";
    }
}
export class MediaPolicyError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = "MediaPolicyError";
    }
}
