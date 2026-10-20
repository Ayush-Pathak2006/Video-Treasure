import { Router } from 'express';
import { searchVideos, getTrendingVideos } from '../controllers/video.controller.js';
import { optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();


// Public, but logged-in visitors get larger YouTube limits, so the access token is read when present.
router.route("/search").get(optionalJWT, searchVideos);
// Public. Served from stored snapshots, so it never calls an API.
router.route("/trending").get(getTrendingVideos);

export default router;
