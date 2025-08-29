import { Router } from 'express';
import { searchVideos } from '../controllers/video.controller.js';

const router = Router();


router.route("/search").get(searchVideos);

export default router;