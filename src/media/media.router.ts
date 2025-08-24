import express from "express";
import { MediaService } from "./media.service";
import MediaController from "./media.controller";
import authenticate from "../common/middlewares/authenticate";
import { canAccess } from "../common/middlewares/canAccess";
import { Roles } from "../common/constants";
import { presignUploadValidator } from "./validators/presign-upload.validator";
import { handleValidation } from "../common/validators/handleValidation";
import { S3StorageProvider } from "./providers/s3.storage";

const storage = new S3StorageProvider();
const mediaService = new MediaService(storage);
const controller = new MediaController(mediaService);

const router = express.Router();

router.post(
    "/presign",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    presignUploadValidator,
    handleValidation,
    controller.presignUpload,
);

export default router;
