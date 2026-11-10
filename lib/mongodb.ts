import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/quorix";
const dbName = process.env.MONGODB_DB || "quorix";

interface GlobalWithMongo {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoClientUri?: string;
}

const globalWithMongo = global as unknown as GlobalWithMongo;

let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  // Fallback warning in development
  console.warn(
    "[Quorix DB] MONGODB_URI is not explicitly defined in environment variables. Falling back to mongodb://localhost:27017/quorix"
  );
}

if (process.env.NODE_ENV === "development") {
  // In development, preserve client across hot-reloads
  if (
    !globalWithMongo._mongoClientPromise ||
    globalWithMongo._mongoClientUri !== uri
  ) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    const connectionPromise = client.connect();
    const retryableConnectionPromise = connectionPromise.catch((error) => {
      if (globalWithMongo._mongoClientPromise === retryableConnectionPromise) {
        delete globalWithMongo._mongoClientPromise;
        delete globalWithMongo._mongoClientUri;
      }
      throw error;
    });

    globalWithMongo._mongoClientPromise = retryableConnectionPromise;
    globalWithMongo._mongoClientUri = uri;
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production, instantiate client per process
  const client = new MongoClient(uri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 5000,
  });
  clientPromise = client.connect();
}

/**
 * Returns the cached MongoDB client instance.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Returns the application database instance.
 */
export async function getDatabase(customDbName?: string): Promise<Db> {
  const client = await getMongoClient();
  return client.db(customDbName || dbName);
}

/**
 * Core User Document Schema (SRS §7.1 & §9.1)
 */
export interface UserDoc {
  _id?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "candidate" | "expert" | "admin";
  status: "active" | "suspended";
  profileCompleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
