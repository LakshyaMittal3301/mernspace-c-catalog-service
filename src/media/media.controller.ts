import { matchedData } from "express-validator";
import { MediaService } from "./media.service";
import { Request } from "express-jwt";
import { Response } from "express";
import createHttpError from "http-errors";
import { isAdmin, isManager } from "../common/utils";

export default class MediaController {
    constructor(private media: MediaService) {}

    presignUpload = async (req: Request, res: Response) => {
        const { purpose, filename, contentType, tenantId, productId } = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as { purpose: "productImage"; filename: string; contentType: string; tenantId?: string; productId?: string };

        let tId = tenantId;

        if (isManager(req)) {
            const t = req.auth?.tenantId;
            if (!t) throw createHttpError(403, "Manager token missing tenantId");
            tId = t;
        } else if (isAdmin(req)) {
            if (!tId) throw createHttpError(400, "tenantId is required for admin");
        }

        try {
            const resp = await this.media.presignUpload({
                purpose,
                filename,
                contentType,
                tenantId: tId!,
                productId,
            });
            res.status(200).json(resp);
        } catch (err: any) {
            const msg = String(err?.message ?? "");
            if (/unsupported contentType|policy|signature/i.test(msg)) {
                throw createHttpError(400, msg);
            }
            throw err;
        }
    };
}
