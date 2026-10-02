import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/user.model.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Relative URL: passport prefixes the protocol + host of the incoming request, so the same code
      // gives http://localhost:8000/... locally and https://<render host>/... in production.
      // `proxy: true` trusts Render's X-Forwarded-Proto header so production URLs use https.
      // Every resulting URL must be listed under "Authorized redirect URIs" in Google Cloud Console.
      callbackURL: "/api/v1/auth/google/callback",
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            fullName: profile.displayName,
            email,
            username: email.split("@")[0],
            authProvider: "google",
            isEmailVerified: true
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;
