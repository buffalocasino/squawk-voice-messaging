# 2. PM2 Process Manager File (Good for local services or containers)
# Assuming we run this command from the project root: /mnt/c/Users/trevo/Projects/squawk-voice-messaging
# Path: pm2.config.js 

module.exports = {
  apps: [
    {
      name: "squawk-signaling",
      script: "server/index.js", 
      exec: "node server/index.js", // Explicit command used by pm2
      instances: 1,
      exec_mode: "cluster",
      watch: true,
      env: {
        NODE_ENV: "production",
      }
    }
  ]
}