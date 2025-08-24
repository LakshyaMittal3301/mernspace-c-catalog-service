import { body } from "express-validator";

export const presignUploadValidator = [
    body("purpose").isIn(["productImage"]).withMessage("invalid purpose"),
    body("filename").isString().trim().notEmpty().withMessage("filename is required"),
    body("contentType").isString().trim().notEmpty().withMessage("contentType is required"),
    body("tenantId").optional().isString().trim().notEmpty(),
    body("productId").optional().isString().trim().notEmpty(),
];
