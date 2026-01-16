import { sendEmail } from "./email.js";

const sendVerificationEmail = async (email, verificationUrl) => {
  const subject = "Verify your email address";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Welcome 👋</h2>
      <p>Thanks for registering. Please verify your email to activate your account.</p>

      <a href="${verificationUrl}"
         style="display:inline-block;padding:10px 20px;
         background:#7c3aed;color:white;
         text-decoration:none;border-radius:5px;">
         Verify Email
      </a>

      <p style="margin-top:20px;font-size:12px;color:#888;">
        This link expires in 15 minutes.
      </p>

      <p>If the button doesn’t work, copy and paste this link:</p>
      <p>${verificationUrl}</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject,
    html
  });
};

export { sendVerificationEmail };
