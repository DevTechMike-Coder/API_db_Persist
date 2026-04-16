import dns from "node:dns";
import mongoose from "mongoose";
import { DNS_SERVERS, MONGO_URI } from "../config/env.js";

if(!MONGO_URI) {
    throw new Error("Please provide a valid MONGO_URI in the env file")
}

const configureMongoDns = () => {
    if (!MONGO_URI.startsWith("mongodb+srv://")) {
        return
    }

    const servers = DNS_SERVERS
        ? DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean)
        : ["1.1.1.1", "8.8.8.8"]

    dns.setServers(servers)
}

export const dbConnect = async () => {
    try {
        configureMongoDns()
        await mongoose.connect(MONGO_URI)
        console.log("Database connected successfully")
    } catch (error) {
        console.error("Error connecting to database", error)
        process.exit(1)
    }
}
