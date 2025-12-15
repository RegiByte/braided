import { defineResource } from 'braided';
import { config as loadEnv } from 'dotenv';

export const configResource = defineResource({
  start: async () => {
    console.log('📝 Loading configuration...');
    
    // Load .env file
    loadEnv();
    
    // Extract the values we care about
    const config = {
      PORT: process.env.PORT || '3000',
      NODE_ENV: process.env.NODE_ENV || 'development',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    };
    
    console.log('✅ Configuration loaded:', config);
    
    return config;
  },
  
  halt: async (config) => {
    console.log('👋 Config shutdown (nothing to clean up)');
    // Config has no cleanup needed, but we demonstrate the lifecycle
  },
});

