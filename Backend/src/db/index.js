import mongoose from "mongoose";
import { ensureQueryStateIndexes } from "../utils/queryStateIndexes.js";

const connectDB = async () => {
  try {
    console.log("Attempting to connect with MONGODB_URI:", process.env.MONGODB_URI);

    const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}`);
    await ensureQueryStateIndexes();
    console.log(`\n✅ MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
  } catch (error) {
    console.log("MONGODB connection FAILED ", error);
    process.exit(1);
  }
};

export default connectDB;