# Story Engine API Documentation

This document describes the API endpoints available in the Primer Story Engine.

## Base URL

All API endpoints are prefixed with `/v1/story`.

## Authentication

Authentication is done via a device ID sent in the `X-Device-ID` header.

## Story Endpoints

### Get Current Story Segment

Retrieves the current story segment for the user.

**Endpoint:** `GET /v1/story/current`

**Response:**
```json
{
  "success": true,
  "segment": {
    "id": "intro",
    "content": "You stand at the edge of a mystical forest. The path ahead forks in two directions: one leads deeper into the shadows, the other curves toward a distant mountain.",
    "choices": [
      {
        "id": "choice1",
        "text": "Take the path into the forest"
      },
      {
        "id": "choice2",
        "text": "Head toward the mountains"
      }
    ]
  },
  "state": {
    "userId": "user123",
    "currentSegmentId": "intro",
    "progress": 5,
    "readSegments": ["intro"]
  }
}
```

### Make a Story Choice

Makes a choice and progress the story to the next segment.

**Endpoint:** `POST /v1/story/choice`

**Request Body:**
```json
{
  "choiceId": "choice1"
}
```

**Response:**
```json
{
  "success": true,
  "segment": {
    "id": "forest-path",
    "content": "You venture deeper into the forest. The trees grow taller and closer together, blocking out most of the sunlight. You hear rustling in the underbrush and catch glimpses of movement.",
    "choices": [
      {
        "id": "choice3",
        "text": "Investigate the strange sounds"
      },
      {
        "id": "choice4",
        "text": "Keep to the path"
      }
    ]
  },
  "state": {
    "userId": "user123",
    "currentSegmentId": "forest-path",
    "progress": 10,
    "readSegments": ["intro", "forest-path"]
  }
}
```

### Update Story Progress

Updates story progress and user preferences.

**Endpoint:** `POST /v1/story/progress`

**Request Body:**
```json
{
  "segmentId": "forest-path",
  "preferences": {
    "genre": "fantasy",
    "tone": "mysterious",
    "character_name": "Elara"
  }
}
```

**Response:**
```json
{
  "success": true,
  "state": {
    "userId": "user123",
    "currentSegmentId": "forest-path",
    "progress": 10,
    "contextualData": {
      "genre": "fantasy",
      "tone": "mysterious",
      "character_name": "Elara"
    },
    "readSegments": ["intro", "forest-path"]
  }
}
```

### Reset Story

Resets the story for the user.

**Endpoint:** `POST /v1/story/reset`

**Response:**
```json
{
  "success": true,
  "message": "Story reset successfully",
  "segment": {
    "id": "intro",
    "content": "You stand at the edge of a mystical forest. The path ahead forks in two directions: one leads deeper into the shadows, the other curves toward a distant mountain.",
    "choices": [
      {
        "id": "choice1",
        "text": "Take the path into the forest"
      },
      {
        "id": "choice2",
        "text": "Head toward the mountains"
      }
    ]
  },
  "state": {
    "userId": "user123",
    "currentSegmentId": "intro",
    "progress": 0,
    "readSegments": []
  }
}
```

### Start Conversation

Starts a new conversational story.

**Endpoint:** `POST /v1/story/conversation/start`

**Request Body:**
```json
{
  "prompt": "A story about a space explorer",
  "preferences": {
    "genre": "sci-fi",
    "tone": "exciting"
  }
}
```

**Response:**
```json
{
  "success": true,
  "response": "You are Captain Zara of the Stellar Explorer, a spaceship designed for deep space exploration. Your mission is to chart the uncharted regions of the Andromeda Galaxy. What would you like to do first?",
  "conversationId": "conv-123456"
}
```

### Converse With Story

Continues a conversational story with user input.

**Endpoint:** `POST /v1/story/converse`

**Request Body:**
```json
{
  "message": "I want to explore the nearest planet",
  "conversationId": "conv-123456"
}
```

**Response:**
```json
{
  "success": true,
  "response": "You direct your ship towards Proxima B, the nearest potentially habitable planet. As you approach, your scanners detect unusual energy readings coming from the surface. What's your next move?",
  "conversationId": "conv-123456"
}
```

## Illustration Endpoints

### Get Current Segment Illustrations

Retrieves illustrations for the current story segment.

**Endpoint:** `GET /v1/story/illustrations/current`

**Response:**
```json
{
  "success": true,
  "segmentId": "forest-path",
  "illustrations": [
    {
      "id": "forest-path",
      "path": "/illustrations/forest-path.jpg",
      "description": "A winding path through a lush, magical forest",
      "tags": ["forest", "path", "nature", "adventure", "journey"],
      "segmentMappings": ["intro", "forest-segment"],
      "themes": ["fantasy", "adventure"],
      "createdAt": "2023-06-15T14:30:00Z"
    }
  ]
}
```

### Get Illustrations for Specific Segment

Retrieves illustrations for a specific story segment.

**Endpoint:** `GET /v1/story/illustrations/segment/:segmentId`

**Response:**
```json
{
  "success": true,
  "segmentId": "cave-entrance",
  "illustrations": [
    {
      "id": "mysterious-cave",
      "path": "/illustrations/mysterious-cave.jpg",
      "description": "A dark cave entrance with glowing crystals inside",
      "tags": ["cave", "crystals", "mystery", "darkness"],
      "segmentMappings": ["cave-entrance", "underground-discovery"],
      "themes": ["mystery", "fantasy", "adventure"],
      "createdAt": "2023-06-15T14:35:00Z"
    }
  ]
}
```

### Search Illustrations

Search for illustrations based on custom criteria.

**Endpoint:** `GET /v1/story/illustrations/search?themes=fantasy,adventure&tags=hero,protagonist&limit=2`

**Response:**
```json
{
  "success": true,
  "query": {
    "themes": ["fantasy", "adventure"],
    "tags": ["hero", "protagonist"],
    "limit": 2
  },
  "illustrations": [
    {
      "id": "hero-character",
      "path": "/illustrations/hero.jpg",
      "description": "The protagonist of the story, ready for adventure",
      "tags": ["hero", "character", "protagonist", "adventurer"],
      "segmentMappings": ["intro", "character-development"],
      "themes": ["adventure", "fantasy"],
      "createdAt": "2023-06-15T14:40:00Z"
    }
  ]
}
```

### Get Specific Illustration

Retrieves a specific illustration by ID.

**Endpoint:** `GET /v1/story/illustrations/:id`

**Response:**
```json
{
  "success": true,
  "illustration": {
    "id": "dragon-encounter",
    "path": "/illustrations/dragon.jpg",
    "description": "A massive dragon perched on a mountain peak",
    "tags": ["dragon", "mountain", "danger", "creature"],
    "segmentMappings": ["dragon-battle", "mountain-peak"],
    "themes": ["fantasy", "danger", "adventure"],
    "createdAt": "2023-06-15T14:45:00Z"
  }
}
```

## Monitoring Endpoints

### Get Dashboard Data

Retrieves monitoring dashboard data.

**Endpoint:** `GET /v1/monitoring/dashboard`

**Response:**
```json
{
  "success": true,
  "timestamp": "2023-06-15T15:00:00Z",
  "data": {
    "totalStories": 250,
    "activeUsers": 45,
    "avgResponseTime": 1250,
    "gptUsage": {
      "totalTokens": 1500000,
      "promptTokens": 500000,
      "completionTokens": 1000000
    }
  }
}
```

### Get GPT Metrics

Retrieves recent GPT usage metrics.

**Endpoint:** `GET /v1/monitoring/gpt?limit=100`

**Response:**
```json
{
  "success": true,
  "count": 2,
  "metrics": [
    {
      "id": "gpt-123",
      "userId": "user123",
      "timestamp": "2023-06-15T14:50:00Z",
      "promptTokens": 150,
      "completionTokens": 200,
      "totalTokens": 350,
      "responseTimeMs": 1200
    },
    {
      "id": "gpt-124",
      "userId": "user456",
      "timestamp": "2023-06-15T14:52:00Z",
      "promptTokens": 180,
      "completionTokens": 250,
      "totalTokens": 430,
      "responseTimeMs": 1500
    }
  ]
}
```

### Get Story Generation Metrics

Retrieves recent story generation metrics.

**Endpoint:** `GET /v1/monitoring/story?limit=100`

**Response:**
```json
{
  "success": true,
  "count": 2,
  "metrics": [
    {
      "id": "story-123",
      "userId": "user123",
      "timestamp": "2023-06-15T14:55:00Z",
      "segmentId": "forest-path",
      "choiceId": "choice1",
      "generationTimeMs": 1500
    },
    {
      "id": "story-124",
      "userId": "user456",
      "timestamp": "2023-06-15T14:57:00Z",
      "segmentId": "mountain-path",
      "choiceId": "choice2",
      "generationTimeMs": 1700
    }
  ]
}
```

### Get User Metrics

Retrieves metrics for a specific user.

**Endpoint:** `GET /v1/monitoring/user/:userId?limit=50`

**Response:**
```json
{
  "success": true,
  "userId": "user123",
  "gptMetrics": {
    "count": 1,
    "metrics": [
      {
        "id": "gpt-123",
        "userId": "user123",
        "timestamp": "2023-06-15T14:50:00Z",
        "promptTokens": 150,
        "completionTokens": 200,
        "totalTokens": 350,
        "responseTimeMs": 1200
      }
    ]
  },
  "storyMetrics": {
    "count": 1,
    "metrics": [
      {
        "id": "story-123",
        "userId": "user123",
        "timestamp": "2023-06-15T14:55:00Z",
        "segmentId": "forest-path",
        "choiceId": "choice1",
        "generationTimeMs": 1500
      }
    ]
  }
}
```

## Health Endpoint

### Health Check

Checks if the API is functioning correctly.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2023-06-15T15:10:00Z"
  }
}
```

## Error Responses

All API endpoints return appropriate HTTP status codes along with error messages for unsuccessful requests.

Example error response:

```json
{
  "success": false,
  "error": "Invalid choice ID",
  "message": "The provided choice ID was not found in the current segment"
}
```

Common status codes:
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error