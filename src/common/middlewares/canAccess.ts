import createHttpError from "http-errors";
import { NextFunction, Response, Request, RequestHandler } from "express";
import { AuthenticatedRequest } from "../types";

export const canAccess = (roles: string[]): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction) => {
        const role = (req as unknown as AuthenticatedRequest).auth?.role;
        if (role && roles.includes(role)) return next();
        return next(createHttpError(403, "Not enough permissions to access this route"));
    };
};
