import { Router } from 'express';
import { StoryController } from '../controllers/storyController';
import { StoryStateService } from '../services/StoryStateService';
import { GPTClient } from '../services/GPTClient';
import { InMemoryStateStorage } from '../services/persistence/InMemoryStateStorage';
import { PersonalizationManager } from '../services/PersonalizationManager';
import { initIllustrationRoutes } from './illustration.routes';
import { DEFAULT_OPENAI_MODEL } from '../config/services';
import path from 'path';

/**
 * Initialize story routes
 */
export function initStoryRoutes(apiKey: string): Router {
  const router = Router();
  
  // Initialize services
  console.log(`[StoryRouter] Initializing GPTClient with model: ${DEFAULT_OPENAI_MODEL} (env: ${process.env.OPENAI_MODEL || 'not set'})`);
  const stateStorage = new InMemoryStateStorage();
  const gptClient = new GPTClient(apiKey, DEFAULT_OPENAI_MODEL);
  const personalizationManager = new PersonalizationManager();
  const storyStateService = new StoryStateService(gptClient, stateStorage, personalizationManager);
  
  // Initialize controller with direct access to the GPT client for conversational mode
  const storyController = new StoryController(
    storyStateService, 
    personalizationManager,
    gptClient
  );
  
  // Set up story routes
  // GET current story segment
  router.get(
    '/current',
    (req, res) => storyController.getCurrentStory(req, res)
  );
  
  // POST to make a choice and progress the story
  router.post(
    '/choice',
    (req, res) => storyController.makeChoice(req, res)
  );
  
  // POST to update progress and contextual data
  router.post(
    '/progress',
    (req, res) => storyController.updateProgress(req, res)
  );
  
  // POST to reset the story (start over)
  router.post(
    '/reset',
    (req, res) => storyController.resetStory(req, res)
  );
  
  // Conversational mode endpoints
  
  // POST to start a new conversational story
  router.post(
    '/conversation/start',
    (req, res) => storyController.startConversation(req, res)
  );
  
  // POST to continue a conversational story with user input
  router.post(
    '/converse',
    (req, res) => storyController.converseWithStory(req, res)
  );
  
  // Initialize and mount illustration routes
  const illustrationRouter = initIllustrationRoutes(storyStateService);
  router.use('/illustrations', illustrationRouter);
  
  return router;
} 