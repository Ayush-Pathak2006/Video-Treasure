import { Router } from 'express';
import { searchVideos, getTrendingVideos, getVideoDetails, getRelatedVideos } from '../controllers/video.controller.js';
import { optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();


// Public, but logged-in visitors get larger YouTube limits, so the access token is read when present.
router.route("/search").get(optionalJWT, searchVideos);
// Public. Served from stored snapshots, so it never calls an API.
router.route("/trending").get(getTrendingVideos);
// Public, from the DB only. Logged-in visitors also get likedByMe. After the fixed paths above.
router.route("/:platform/:platformVideoId").get(optionalJWT, getVideoDetails);
// Public, from the DB only: "Up next". Logged-in visitors' watched videos move down.
router.route("/:platform/:platformVideoId/related").get(optionalJWT, getRelatedVideos);

export default router;
