// db.ts
import mongoose from "mongoose";
import config from "config";

export const initDb = async () => {
    const url = config.get<string>("mongodb.url");
    await mongoose.connect(url, { serverSelectionTimeoutMS: 5000 });
};
