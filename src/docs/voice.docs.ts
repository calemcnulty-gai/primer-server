/**
 * @swagger
 * components:
 *   schemas:
 *     VoiceStatus:
 *       type: object
 *       required:
 *         - status
 *         - ready
 *       properties:
 *         status:
 *           type: string
 *           description: Current status of the voice service
 *           enum: [initializing, running, error]
 *         ready:
 *           type: boolean
 *           description: Whether the voice service is ready to accept connections
 *
 *     WebRTCConfig:
 *       type: object
 *       required:
 *         - iceServers
 *       properties:
 *         iceServers:
 *           type: array
 *           description: List of ICE servers for WebRTC connection
 *           items:
 *             type: object
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: string
 *                 description: URL of the ICE server
 *
 *     WebRTCMessage:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           description: Type of the WebRTC message
 *           enum: [offer, answer, ice-candidate, start-listening, stop-listening, speaking-start, speaking-end, error]
 *         sdp:
 *           type: object
 *           description: Session Description Protocol data (for offer/answer types)
 *         candidate:
 *           type: object
 *           description: ICE candidate data (for ice-candidate type)
 *         error:
 *           type: object
 *           description: Error details (for error type)
 *           properties:
 *             code:
 *               type: string
 *               description: Error code
 *             message:
 *               type: string
 *               description: Human-readable error message
 */

/**
 * @swagger
 * tags:
 *   name: Voice
 *   description: Voice interaction API for WebRTC
 */

/**
 * @swagger
 * /api/v1/voice/status:
 *   get:
 *     summary: Check the status of the voice service
 *     description: Returns whether the voice service is ready to accept connections
 *     tags: [Voice]
 *     responses:
 *       200:
 *         description: Status of the voice service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VoiceStatus'
 */

/**
 * @swagger
 * /api/v1/voice/config:
 *   get:
 *     summary: Get WebRTC configuration
 *     description: Returns the configuration needed for WebRTC connections
 *     tags: [Voice]
 *     responses:
 *       200:
 *         description: WebRTC configuration including ICE servers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebRTCConfig'
 */

/**
 * @swagger
 * /api/v1/voice:
 *   get:
 *     summary: WebSocket endpoint for voice communication
 *     description: WebSocket endpoint for establishing WebRTC connections for voice interaction.
 *                  This endpoint uses the WebSocket protocol and cannot be accessed via HTTP.
 *     tags: [Voice]
 *     responses:
 *       400:
 *         description: This endpoint requires WebSocket protocol
 */