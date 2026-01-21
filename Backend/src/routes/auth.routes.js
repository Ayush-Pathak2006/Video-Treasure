console.log("🔥 auth.routes.js LOADED");

import { Router } from "express";
import passport from "passport";
import { oauthSuccess } from "../controllers/auth.controller.js";

const router = Router();
router.get("/ping", (req, res) => {
  res.send("AUTH ROUTER PING OK");
});


router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  oauthSuccess,
);

export default router;
