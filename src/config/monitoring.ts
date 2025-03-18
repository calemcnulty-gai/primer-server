/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  healthCheck: {
    enabled: boolean;
    path: string;
  };
  performance: {
    enabled: boolean;
    responseTime: {
      enabled: boolean;
    };
  };
  errorTracking: {
    enabled: boolean;
  };
}

const monitoringConfig: MonitoringConfig = {
  // Health check endpoint configuration
  healthCheck: {
    enabled: true,
    path: '/health'
  },
  
  // Performance monitoring configuration
  performance: {
    enabled: process.env.NODE_ENV !== 'test',
    responseTime: {
      enabled: process.env.NODE_ENV !== 'production'
    }
  },
  
  // Error tracking configuration
  errorTracking: {
    enabled: true
  }
};

export default monitoringConfig; 