import { Router } from 'express';
import { VoiceControllerInterface } from '../controllers/voiceController';

/**
 * Initializes voice routes
 * @param voiceController The controller for voice interactions
 * @returns Router for voice endpoints
 */
export const initVoiceRoutes = (voiceController: VoiceControllerInterface): Router => {
  const router = Router();

  /**
   * GET /api/v1/voice/status
   * @summary Checks if voice API is ready to accept connections
   * @tags Voice - Voice interaction API endpoints
   * @return {object} 200 - Success response
   */
  router.get('/status', voiceController.getStatus);

  /**
   * GET /api/v1/voice/config
   * @summary Gets the WebRTC configuration for clients
   * @tags Voice - Voice interaction API endpoints
   * @return {object} 200 - Success response with ICE servers configuration
   */
  router.get('/config', voiceController.getConfig);

  return router;
};