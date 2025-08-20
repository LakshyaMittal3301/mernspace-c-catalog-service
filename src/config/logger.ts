import winston from "winston";

const logger = winston.createLogger({
    level: "info",
    defaultMeta: {
        serviceName: "catalog-service",
    },
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({
            level: "info",
            dirname: "logs",
            filename: "combined.log",
            silent: process.env.NODE_ENV == "test",
        }),

        new winston.transports.File({
            level: "error",
            dirname: "logs",
            filename: "error.log",
            silent: process.env.NODE_ENV == "test",
        }),

        new winston.transports.Console({
            level: "info",
            silent: process.env.NODE_ENV == "test",
        }),
    ],
});

export default logger;
