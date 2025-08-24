import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";

import { Roles } from "../../src/common/constants";
import authenticate from "../../src/common/middlewares/authenticate";
import { canAccess } from "../../src/common/middlewares/canAccess";
import { handleValidation } from "../../src/common/validators/handleValidation";

import { presignUploadValidator } from "../../src/media/validators/presign-upload.validator";
import MediaController from "../../src/media/media.controller";
import { MediaService } from "../../src/media/media.service";
import { StorageProvider } from "../../src/media/ports/storage.provider";
import { UnsupportedContentTypeError, MediaPolicyError } from "../../src/media/media.errors";
import { StorageConfig } from "../../src/config/storage";

// ---- Fake storage provider for tests (no AWS) ----
class FakeStorageProvider implements StorageProvider {
    constructor(private opts: { throwPolicy?: boolean } = {}) {}

    async presignPost({
        key,
        contentType,
    }: {
        key: string;
        contentType: string;
        maxBytes: number;
        expiresSec: number;
    }) {
        if (this.opts.throwPolicy) {
            throw new MediaPolicyError("policy error (simulated)");
        }
        // return a deterministic, S3-like shape
        return {
            url: "https://fake-bucket.local",
            fields: {
                key,
                "Content-Type": contentType,
                Policy: "BASE64_POLICY",
                "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
                "X-Amz-Credential": "test/20250101/region/s3/aws4_request",
                "X-Amz-Date": "20250101T000000Z",
                "X-Amz-Signature": "deadbeef",
            },
        };
    }

    publicUrlForKey(key: string): string {
        return `https://fake-bucket.local/${encodeURI(key)}`;
    }
}

// Helpers
const makeTokenFactory =
    (jwks: JWKSMock) =>
    (role: string, extra: Record<string, any> = {}) =>
        jwks.token({ sub: "u-1", role, ...extra });

/** Build an express app with only the /media/presign route and DI of a storage provider */
function makeApp(storage: StorageProvider) {
    const mediaService = new MediaService(storage);
    const controller = new MediaController(mediaService);
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    const router = express.Router();
    router.post(
        "/presign",
        authenticate,
        canAccess([Roles.ADMIN, Roles.MANAGER]),
        presignUploadValidator,
        handleValidation,
        controller.presignUpload,
    );
    app.use("/media", router);
    return app;
}

describe("MediaService (unit, no HTTP)", () => {
    it("builds key under products/<tenant>/<productId>/ and returns public URL", async () => {
        const fake = new FakeStorageProvider();
        const svc = new MediaService(fake);

        const res = await svc.presignUpload({
            purpose: "productImage",
            tenantId: "tenant-123",
            productId: "prod-999",
            filename: "Pizza Supreme.JPG",
            contentType: "image/jpeg",
        });

        // key is server-generated with sanitized filename
        expect(res.asset.key).toMatch(/^products\/tenant-123\/prod-999\/pizza-supreme\.jpg$/);
        expect(res.asset.url).toBe(`https://fake-bucket.local/${res.asset.key}`);

        // upload fields include key & content-type; looks like an S3 policy shape
        expect(res.upload.url).toBe("https://fake-bucket.local");
        expect(res.upload.fields.key).toBe(res.asset.key);
        expect(res.upload.fields["Content-Type"]).toBe("image/jpeg");
        expect(res.upload.fields.Policy).toBeTruthy();

        // maxBytes derived from config
        expect(res.upload.maxBytes).toBe(StorageConfig.maxSizeMB * 1024 * 1024);
    });

    it("rejects unsupported content types", async () => {
        const fake = new FakeStorageProvider();
        const svc = new MediaService(fake);

        await expect(
            svc.presignUpload({
                purpose: "productImage",
                tenantId: "t-1",
                filename: "x.gif",
                contentType: "image/gif", // not in allowedContentTypes
            }),
        ).rejects.toBeInstanceOf(UnsupportedContentTypeError);
    });
});

describe("POST /media/presign (route-level with DI, no AWS)", () => {
    const route = "/media/presign";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    beforeAll(() => {
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(() => {
        stopJwks = jwks.start();
    });

    afterEach(() => {
        stopJwks();
    });

    const adminToken = (makeToken: ReturnType<typeof makeTokenFactory>) => makeToken(Roles.ADMIN);
    const managerToken = (makeToken: ReturnType<typeof makeTokenFactory>, tenantId?: string) =>
        makeToken(Roles.MANAGER, tenantId ? { tenantId } : {});

    it("401 when unauthenticated", async () => {
        const app = makeApp(new FakeStorageProvider());
        await request(app).post(route).send({}).expect(401);
    });

    it("403 when role not ADMIN/MANAGER", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const customer = makeToken("CUSTOMER");
        await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${customer}`])
            .send({ purpose: "productImage", filename: "a.jpg", contentType: "image/jpeg", tenantId: "t-1" })
            .expect(403);
    });

    it("400 validator when filename missing", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        const res = await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", contentType: "image/jpeg", tenantId: "t-1" })
            .expect(400);
        expect(res.body).toHaveProperty("errors");
    });

    it("200 (ADMIN) generates key using body.tenantId", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        const res = await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", filename: "pizza.jpg", contentType: "image/jpeg", tenantId: "tenant-123" })
            .expect(200);

        const { upload, asset } = res.body;
        expect(upload).toBeTruthy();
        expect(asset.key).toMatch(/^products\/tenant-123\/[A-Za-z0-9_\-]+\/pizza\.jpg$/);
        expect(asset.url).toMatch(/https:\/\/fake-bucket\.local\/products\/tenant-123\/.+\/pizza\.jpg/);
        expect(upload.fields).toHaveProperty("key", asset.key);
        expect(upload.fields).toHaveProperty("Content-Type", "image/jpeg");
        expect(upload.fields).toHaveProperty("Policy");
        expect(upload.fields).toHaveProperty("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    });

    it("400 (ADMIN) when tenantId missing in body", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", filename: "pizza.jpg", contentType: "image/jpeg" })
            .expect(400);
    });

    it("200 (MANAGER) ignores body.tenantId and uses tenantId from JWT", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const mgr = managerToken(makeToken, "tenant-mgr");

        const res = await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${mgr}`])
            .send({
                purpose: "productImage",
                filename: "pizza.jpg",
                contentType: "image/jpeg",
                tenantId: "wrong-tenant", // should be ignored
            })
            .expect(200);

        expect(res.body.asset.key).toMatch(/^products\/tenant-mgr\/[A-Za-z0-9_\-]+\/pizza\.jpg$/);
    });

    it("403 (MANAGER) when tenantId missing from JWT", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const mgrNoTenant = managerToken(makeToken); // no tenantId claim

        await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${mgrNoTenant}`])
            .send({ purpose: "productImage", filename: "pizza.jpg", contentType: "image/jpeg" })
            .expect(403);
    });

    it("400 when contentType not allowed (service throws UnsupportedContentTypeError)", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", filename: "x.gif", contentType: "image/gif", tenantId: "t-1" })
            .expect(400);
    });

    it("400 when storage provider signals a policy error", async () => {
        const app = makeApp(new FakeStorageProvider({ throwPolicy: true }));
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        const res = await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", filename: "pizza.jpg", contentType: "image/jpeg", tenantId: "t-1" })
            .expect(400);
    });

    it("200 includes a realistic S3-form shape in fields", async () => {
        const app = makeApp(new FakeStorageProvider());
        const makeToken = makeTokenFactory(jwks);
        const admin = adminToken(makeToken);

        const res = await request(app)
            .post(route)
            .set("Cookie", [`accessToken=${admin}`])
            .send({ purpose: "productImage", filename: "card.png", contentType: "image/png", tenantId: "t-1" })
            .expect(200);

        const { upload, asset } = res.body;
        expect(upload.url).toMatch(/^https?:\/\//);
        expect(upload.fields).toMatchObject({
            key: asset.key,
            "Content-Type": "image/png",
        });
        expect(upload.fields.Policy).toBeTruthy();
        expect(upload.fields["X-Amz-Algorithm"]).toBe("AWS4-HMAC-SHA256");
        expect(upload.maxBytes).toBe(StorageConfig.maxSizeMB * 1024 * 1024);
    });
});
