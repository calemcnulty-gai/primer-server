import dotenv from 'dotenv';
import { OpenAIConfig } from '../types/openai';

// Load environment variables
dotenv.config();

interface MonitoringConfig {
  enabled: boolean;
  logLevel: string;
}

interface CorsConfig {
  origin: string;
  methods: string[];
  allowedHeaders: string[];
}

interface Config {
  port: number;
  nodeEnv: string;
  logLevel: string;
  openai: OpenAIConfig;
  monitoring: MonitoringConfig;
  cors: CorsConfig;
}

// Configuration object
const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    organization: process.env.OPENAI_ORGANIZATION
  },
  
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    logLevel: process.env.MONITORING_LOG_LEVEL || 'info'
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  }
};

// Validate required configuration
if (!config.openai.apiKey) {
  console.warn('OpenAI API key not configured. API calls will likely fail.');
}

export default config; 