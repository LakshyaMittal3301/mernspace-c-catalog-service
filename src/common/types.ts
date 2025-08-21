export type AccessTokenClaims = {
    sub: string;
    role: string;
};

export type AuthenticatedRequest = Request & { auth: AccessTokenClaims };
