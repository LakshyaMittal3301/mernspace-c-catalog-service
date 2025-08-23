import { Request } from "express";
import { Roles } from "./constants";

export const isAdmin = (req: Request<any, any, any, any>) => (req as any)?.auth?.role === Roles.ADMIN;
