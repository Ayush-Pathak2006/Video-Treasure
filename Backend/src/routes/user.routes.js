import { Router } from 'express';
import { registerUser, loginUser, logoutUser, refreshAccessToken, verifyEmail, resendVerificationEmail, forgotPassword, resetPassword} from '../controllers/user.controller.js';

const router = Router();

router.route("/register").post(registerUser);
router.route("/verify-email").get(verifyEmail);
router.route("/login").post(loginUser);
router.route("/resend-verification-email").post(resendVerificationEmail);
// No verifyJWT here on purpose: logout must work even when the access token has expired (see logoutUser).
router.route("/logout").post(logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password").post(resetPassword);



export default router;

