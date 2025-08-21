import { expressjwt } from "express-jwt";
import jwksClient from "jwks-rsa";
import { Request } from "express";
import config from "config";

export default expressjwt({
    secret: jwksClient.expressJwtSecret({
        jwksUri: config.get("jwksUri"),
        cache: true,
        rateLimit: true,
    }),

    requestProperty: "auth",

    algorithms: ["RS256"],
    getToken(req: Request) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.split(" ")[1] !== "undefined") {
            const token = authHeader.split(" ")[1];
            if (token) return token;
        }

        const { accessToken } = req.cookies;
        return accessToken;
    },
});
