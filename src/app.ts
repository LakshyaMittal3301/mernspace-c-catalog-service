import express, { Request, Response } from "express";
import { globalErrorHandler } from "./common/middlewares/globalErrorHandler";
import cookieParser from "cookie-parser";
import categoryRouter from "./categories/category.router";
import productRouter from "./products/product.router";
import mediaRouter from "./media/media.router";

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.use("/categories", categoryRouter);
app.use("/products", productRouter);
app.use("/media", mediaRouter);

app.use(globalErrorHandler);

export default app;
