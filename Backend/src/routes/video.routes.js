import { Router } from 'express';
import { searchVideos } from '../controllers/video.controller.js';

const router = Router();

// Public route, no authentication needed
router.route("/search").get(searchVideos);

export default router;