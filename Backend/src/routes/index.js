import { Router } from 'express';
import videoRouter from './video.routes.js';

const router = Router();

router.use('/videos', videoRouter);

export default router;