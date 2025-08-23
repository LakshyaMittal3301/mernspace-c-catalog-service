import { Request } from "express";

export type AccessTokenClaims = {
    sub: string;
    role: string;
    tenantId?: string;
};

export type AuthenticatedRequest = Request & { auth: AccessTokenClaims };
