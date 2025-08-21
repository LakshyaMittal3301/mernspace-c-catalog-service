import express, { Request, Response } from "express";
import { globalErrorHandler } from "./common/middlewares/globalErrorHandler";
import categoryRouter from "./categories/category.router";
const app = express();
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.use("/categories", categoryRouter);

app.use(globalErrorHandler);

export default app;
