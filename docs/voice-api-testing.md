# Voice API Testing Guide

This document provides instructions for setting up and testing the voice echo service.

## Setup

### 1. Install Dependencies

Ensure you have all the required dependencies installed:

```bash
npm install
```

### 2. API Keys

You need to obtain the following API keys and add them to your `.env` file:

1. **Deepgram** (Speech-to-Text)
   - Sign up at [https://deepgram.com](https://deepgram.com)
   - Create a new API key from the Dashboard
   - Add to `.env`: `DEEPGRAM_API_KEY=your_key_here`

2. **Gemini** (LLM)
   - Sign up at [https://ai.google.dev/](https://ai.google.dev/)
   - Create a new API key from the Google AI Studio
   - Add to `.env`: `GEMINI_API_KEY=your_key_here`

3. **Cartesia** (Text-to-Speech)
   - Sign up at [https://cartesia.ai](https://cartesia.ai)
   - Generate an API key from your account settings
   - Add to `.env`: `CARTESIA_API_KEY=your_key_here`
   - Add to `.env`: `CARTESIA_API_URL=https://api.cartesia.ai/v1/text-to-speech`

### 3. Start the Server

Run the server in development mode:

```bash
npm run dev
```

## Testing the Voice API

### 1. Check API Status

First, check if the voice service is ready:

```bash
curl http://localhost:3000/api/v1/voice/status
```

Expected response:
```json
{
  "status": "running",
  "ready": true
}
```

### 2. Get WebRTC Configuration

Retrieve the WebRTC configuration:

```bash
curl http://localhost:3000/api/v1/voice/config
```

Expected response:
```json
{
  "iceServers": [
    {
      "urls": "stun:stun.l.google.com:19302"
    }
  ]
}
```

### 3. Testing with WebRTC

For a full WebRTC test, you'll need a client implementation. You can use the sample client provided in `docs/voice-client-example.md` as a reference.

### 4. Testing the Audio Processing Pipeline

To test just the audio processing pipeline without WebRTC, you can create a simple test script:

```javascript
// test-voice-echo.js
const fs = require('fs');
const axios = require('axios');

// Replace with the path to your test audio file (WebM format)
const audioFile = 'test-audio.webm';

async function testEchoService() {
  try {
    // Read the audio file
    const audioData = fs.readFileSync(audioFile);
    
    // Step 1: Deepgram - Speech to Text
    console.log('Step 1: Converting speech to text...');
    const deepgramResponse = await axios.post(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      audioData,
      {
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/webm',
        },
      }
    );
    
    const transcript = deepgramResponse.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    console.log(`Transcript: "${transcript}"`);
    
    // Step 2: Gemini - LLM Processing
    console.log('\nStep 2: Processing with LLM...');
    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent',
      {
        contents: [
          {
            parts: [
              {
                text: `User said: "${transcript}"
                
                For this echo service, respond briefly to what the user said. Keep your response under 30 words.`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );
    
    const llmResponse = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`LLM Response: "${llmResponse}"`);
    
    // Step 3: Cartesia - Text to Speech
    console.log('\nStep 3: Converting text to speech...');
    const cartesiaResponse = await axios.post(
      process.env.CARTESIA_API_URL,
      {
        text: llmResponse,
        voice: 'en-US-Neural2-F',
        format: 'mp3',
        speed: 1.0,
        pitch: 1.0
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.CARTESIA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer'
      }
    );
    
    // Save the audio response
    fs.writeFileSync('response.mp3', Buffer.from(cartesiaResponse.data));
    console.log('Response saved to response.mp3');
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error testing voice echo service:', error.message);
    if (error.response) {
      console.error('Response error:', error.response.data);
    }
  }
}

// Run the test
testEchoService();
```

Run the test script with:

```bash
node test-voice-echo.js
```

## Common Issues and Troubleshooting

### 1. API Key Issues

- Ensure all API keys are correctly set in your `.env` file
- Check that the API keys have not expired
- Verify you have sufficient credits/quota on each service

### 2. Audio Format Issues

- Deepgram works best with WebM, WAV, or MP3 formats
- Ensure the audio is not corrupted
- Check the audio sample rate (16kHz is recommended)

### 3. WebRTC Connection Issues

- Check browser console for WebRTC errors
- Verify that STUN/TURN servers are accessible
- Ensure the WebSocket connection is established before attempting WebRTC

### 4. Server Errors

If the server logs errors:

1. Check the API key configuration
2. Verify network connectivity to all services
3. Ensure the server has sufficient memory and CPU resources

## Next Steps

After basic testing is complete, you can enhance the integration:

1. Implement real WebRTC audio streaming
2. Add conversation history for context-aware responses
3. Create a more sophisticated LLM prompt for better responses
4. Add voice customization options