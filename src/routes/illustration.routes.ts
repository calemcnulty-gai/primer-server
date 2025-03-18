import { Router } from 'express';
import { IllustrationController } from '../controllers/illustrationController';
import { IllustrationService } from '../services/IllustrationService';
import { StoryStateService } from '../services/StoryStateService';
import path from 'path';

/**
 * Initialize illustration routes
 */
export function initIllustrationRoutes(storyStateService: StoryStateService): Router {
  const router = Router();
  
  // Initialize services
  const illustrationService = new IllustrationService(
    path.join(__dirname, '../../public')
  );
  
  // Initialize controller
  const illustrationController = new IllustrationController(
    illustrationService,
    storyStateService
  );
  
  // Set up routes
  // GET illustrations for current segment
  router.get(
    '/current',
    (req, res) => illustrationController.getCurrentIllustrations(req, res)
  );
  
  // GET illustrations for specific segment
  router.get(
    '/segment/:segmentId',
    (req, res) => illustrationController.getSegmentIllustrations(req, res)
  );
  
  // GET illustrations by search criteria
  router.get(
    '/search',
    (req, res) => illustrationController.searchIllustrations(req, res)
  );
  
  // GET specific illustration by ID
  router.get(
    '/:id',
    (req, res) => illustrationController.getIllustration(req, res)
  );
  
  return router;
}