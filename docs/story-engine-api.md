# Story Engine API Documentation

This document describes the API endpoints available in the Primer Story Engine.

## Base URL

All API endpoints are prefixed with `/api/v1/story`.

## Authentication

Authentication is done via one of:
- A JWT token sent in the `Authorization` header
- A device ID sent in the `X-Device-ID` header (for demo and testing purposes)

## Story Endpoints

### Get Current Story Segment

Retrieves the current story segment for the user.

**Endpoint:** `GET /api/v1/story/current`

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

**Endpoint:** `POST /api/v1/story/choice`

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

**Endpoint:** `POST /api/v1/story/progress`

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

**Endpoint:** `POST /api/v1/story/reset`

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

## Illustration Endpoints

### Get Current Segment Illustrations

Retrieves illustrations for the current story segment.

**Endpoint:** `GET /api/v1/story/illustrations/current`

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

**Endpoint:** `GET /api/v1/story/illustrations/segment/:segmentId`

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

**Endpoint:** `GET /api/v1/story/illustrations/search?themes=fantasy,adventure&tags=hero,protagonist&limit=2`

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

**Endpoint:** `GET /api/v1/story/illustrations/:id`

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