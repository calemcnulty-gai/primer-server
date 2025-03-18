/**
 * Represents an authenticated user in the system
 * Used for device ID based authentication
 */
export interface AuthenticatedUser {
  /**
   * The unique identifier for the user/device
   */
  id: string;

  /**
   * Optional metadata associated with the user/device
   */
  metadata: Record<string, any>;
} 