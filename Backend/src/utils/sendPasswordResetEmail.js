import { sendEmail } from "./email.js";

const sendPasswordResetEmail = async (email, resetUrl) => {
  await sendEmail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>You requested a password reset.</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link expires in 15 minutes.</p>
    `
  });
};

export { sendPasswordResetEmail };
