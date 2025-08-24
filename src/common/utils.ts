import { Request } from "express-jwt";
import { Roles } from "./constants";

export const isAdmin = (req: Request) => req.auth?.role === Roles.ADMIN;
export const isManager = (req: Request) => req.auth?.role === Roles.MANAGER;
