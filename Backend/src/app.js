import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
// Routes import
import videoRouter from './routes/video.routes.js';
import userRouter from './routes/user.routes.js';
import likeRouter from './routes/like.routes.js'; 
import playlistRouter from './routes/playlist.routes.js';
import { errorHandler } from "./middlewares/error.middleware.js";
import { floodLimiter } from "./middlewares/rateLimit.middleware.js";

import passport from "passport";
import "./config/passport.js";
import authRoutes from "./routes/auth.routes.js";

const DEFAULT_TRUST_PROXY_HOPS = 1;
const PROXY_CHAIN_LOG_LIMIT = 10;

const getTrustProxyHops = () => {
    const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS, 10);
    return Number.isInteger(hops) && hops >= 0 ? hops : DEFAULT_TRUST_PROXY_HOPS;
};

const app = express();

// Render's proxies sit between the visitor and the app, so req.ip has to come from X-Forwarded-For. Only the
// last TRUST_PROXY_HOPS addresses are trusted (the proxies'); anything a client writes further left is ignored.
// Never `true`: that trusts the whole header, which clients can fake. Same as `app.set("trust proxy", N)`, but
// the env var is read per request instead of at import.
app.set("trust proxy", (_address, hopIndex) => hopIndex < getTrustProxyHops());

// The proxy chain of the first requests after a start, to pick TRUST_PROXY_HOPS: it is 1 + the number of
// X-Forwarded-For entries to the right of the visitor's own IP.
let proxyChainLogsLeft = PROXY_CHAIN_LOG_LIMIT;
app.use("/api/v1", (req, _res, next) => {
    if (proxyChainLogsLeft > 0 && req.headers["x-forwarded-for"]) {
        proxyChainLogsLeft -= 1;
        console.log(
            `🌐 [proxy] x-forwarded-for="${req.headers["x-forwarded-for"]}" socket=${req.socket.remoteAddress} req.ip=${req.ip} TRUST_PROXY_HOPS=${getTrustProxyHops()}`
        );
    }
    next();
});

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(passport.initialize());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));



app.use(cookieParser());

// The uptime monitor (Pingbeat) calls this every 5 minutes. It is registered before the flood limit, so it is
// never limited.
app.use("/api/v1/test", (req, res) => {
    res.status(200).json({ message: "Test route is working!" });
});

app.use("/api/v1", floodLimiter);


// Routes declaration
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/users", userRouter);   
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/playlists", playlistRouter);
app.use("/api/v1/auth", authRoutes);
app.use(errorHandler);

export { app };