import { checkSchema } from "express-validator";

export const deleteCategoryValidator = checkSchema(
    {
        id: {
            in: ["params"],
            isMongoId: { errorMessage: "Invalid category id" },
        },
    },
    ["params"],
);
