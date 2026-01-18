import { Router } from 'express';
import { registerUser, loginUser, logoutUser, refreshAccessToken, verifyEmail, resendVerificationEmail, forgotPassword, resetPassword} from '../controllers/user.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.route("/register").post(registerUser);
router.route("/verify-email").get(verifyEmail);
router.route("/login").post(loginUser);
router.route("/resend-verification-email").post(resendVerificationEmail);
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password").post(resetPassword);



export default router;

