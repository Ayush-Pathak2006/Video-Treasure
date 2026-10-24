import { Router } from 'express';
import {
    addToHistory,
    getHistory,
    removeFromHistory,
    clearMyHistory,
    updateHistoryPaused,
} from '../controllers/watchHistory.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// The watch history is private: every route needs a logged-in user.
router.use(verifyJWT);

router.route("/").get(getHistory).post(addToHistory).delete(clearMyHistory);
router.route("/paused").put(updateHistoryPaused);
router.route("/:videoKey").delete(removeFromHistory);

export default router;
