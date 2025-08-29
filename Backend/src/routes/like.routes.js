import { Router } from 'express';
import { toggleVideoLike, getLikedVideos, getLikedVideoIds } from '../controllers/like.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// This route is protected, only logged-in users can like videos
router.use(verifyJWT);

router.route("/toggle").post(toggleVideoLike);

router.route("/videos").get(getLikedVideos);

router.route("/ids").get(getLikedVideoIds); 

export default router;