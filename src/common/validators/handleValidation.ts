import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const handleValidation = (req: Request, res: Response, next: NextFunction) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array().map((err) => ({
        type: "ValidationError",
        msg: err.msg,
        path: err.type === "field" ? err.path : "",
        location: err.type === "field" ? err.location : "",
    }));

    return res.status(400).json({ errors });
};
