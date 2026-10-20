// Creates a verified email-login user for the Docker Compose demo, which can't send verification emails.
// Run from the deploy folder while the stack is up:
//   docker compose run --rm -v ./create-demo-user.mjs:/usr/src/app/create-demo-user.mjs worker node create-demo-user.mjs
// Optional arguments: an email and a password (defaults: demo@example.com / demo-password-123).
import mongoose from "mongoose";
import { User } from "./src/models/user.model.js";

const [email = "demo@example.com", password = "demo-password-123"] = process.argv.slice(2);

await mongoose.connect(process.env.MONGODB_URI);

if (await User.exists({ email })) {
  console.log(`${email} already exists.`);
} else {
  await User.create({
    username: email.split("@")[0].toLowerCase(),
    email,
    fullName: "Demo User",
    password,
    isEmailVerified: true,
  });
  console.log(`Created ${email} (password: ${password}). Log in at http://localhost:8080/login`);
}

await mongoose.disconnect();
