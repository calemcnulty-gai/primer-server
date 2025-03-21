import express from 'express';
import { websocketMiddleware } from '../middleware/websocket.middleware';
import { MediasoupService } from '../services/MediasoupService';

const router = express.Router();

// Apply WebSocket middleware
router.use(websocketMiddleware);

// Export the router
export default router; 