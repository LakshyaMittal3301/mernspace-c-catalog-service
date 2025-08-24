import createHttpError from "http-errors";
import { NextFunction, Response, RequestHandler } from "express";
import { Request } from "express-jwt";

export const canAccess = (roles: string[]): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction) => {
        const role = req.auth?.role;
        if (role && roles.includes(role)) return next();
        return next(createHttpError(403, "Not enough permissions to access this route"));
    };
};
