import express from "express";
import { PORT } from "./config/env.js";
import apiRouter from "./src/routes/apiRoutes.js";
import { dbConnect } from "./databse/db.js";

const app = express();

app.use(express.json());

// CORS Header: Access-Control-Allow-Origin: *
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use("/api", apiRouter);

dbConnect().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running now on port ${PORT}`);
  });
});
