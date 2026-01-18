import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
// Routes import
import videoRouter from './routes/video.routes.js';
import userRouter from './routes/user.routes.js';
import likeRouter from './routes/like.routes.js'; 
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use("/api/v1/test", (req, res) => {
    res.status(200).json({ message: "Test route is working!" });
});


// Routes declaration
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/users", userRouter);   
app.use("/api/v1/likes", likeRouter);
// app.use("/api/v1/users", userRouter);
app.use(errorHandler);

export { app };