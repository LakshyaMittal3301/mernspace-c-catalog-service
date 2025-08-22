import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo: MongoMemoryServer | null = null;

export async function startTestMongo(dbName = "catalog_test") {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri, { dbName });
}

export async function stopTestMongo() {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.connection.close().catch(() => {});
    if (mongo) await mongo.stop();
    mongo = null;
}

export async function clearTestMongo() {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
