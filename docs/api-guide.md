# Primer Server API Guide

This is a quick reference guide for client applications to interact with the Primer Server API.

## Base URL

All story-related API endpoints are prefixed with `/v1/story`.

## Authentication

Include the device ID in the `X-Device-ID` header with all requests:

```
X-Device-ID: your-unique-device-id
```

## API Endpoints

### Health Check
- `GET /health` - Check if the API is functioning correctly

### Story Endpoints
- `GET /v1/story/current` - Get the current story segment
- `POST /v1/story/choice` - Make a choice and progress the story
- `POST /v1/story/progress` - Update story progress and preferences
- `POST /v1/story/reset` - Reset the story to the beginning

### Conversational Story Endpoints
- `POST /v1/story/conversation/start` - Start a new conversational story
- `POST /v1/story/converse` - Continue a conversational story with user input

### Illustration Endpoints
- `GET /v1/story/illustrations/current` - Get illustrations for current segment
- `GET /v1/story/illustrations/segment/:segmentId` - Get illustrations for a specific segment
- `GET /v1/story/illustrations/search` - Search for illustrations by criteria
- `GET /v1/story/illustrations/:id` - Get a specific illustration by ID

### Monitoring Endpoints
- `GET /v1/monitoring/dashboard` - Get monitoring dashboard data
- `GET /v1/monitoring/gpt` - Get recent GPT usage metrics
- `GET /v1/monitoring/story` - Get recent story generation metrics
- `GET /v1/monitoring/user/:userId` - Get metrics for a specific user

## Common Request/Response Patterns

### Authentication
All requests should include the device ID:
```
X-Device-ID: your-unique-device-id
```

### Success Response Format
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response Format
```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

## Example Usage

### Starting a Story
1. Get the current story segment:
   ```
   GET /v1/story/current
   X-Device-ID: your-device-id
   ```

2. Make a choice:
   ```
   POST /v1/story/choice
   X-Device-ID: your-device-id
   Content-Type: application/json
   
   {
     "choiceId": "choice1"
   }
   ```

### Starting a Conversational Story
1. Start a conversation:
   ```
   POST /v1/story/conversation/start
   X-Device-ID: your-device-id
   Content-Type: application/json
   
   {
     "prompt": "A story about a space explorer",
     "preferences": {
       "genre": "sci-fi",
       "tone": "exciting"
     }
   }
   ```

2. Continue the conversation:
   ```
   POST /v1/story/converse
   X-Device-ID: your-device-id
   Content-Type: application/json
   
   {
     "message": "I want to explore the nearest planet",
     "conversationId": "conv-123456"
   }
   ```

### Getting Illustrations
```
GET /v1/story/illustrations/current
X-Device-ID: your-device-id
```

## Error Handling
Common HTTP status codes:
- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (missing or invalid device ID)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error

Always check the `success` field in the response to determine if the request was successful. 