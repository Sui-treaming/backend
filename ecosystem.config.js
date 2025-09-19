module.exports = {
  apps: [
    {
      name: 'upsuider-backend',
      cwd: '/home/wiimdy/upsuider/backend',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      env_file: '/home/wiimdy/upsuider/backend/.env',
      out_file: '/home/wiimdy/.pm2/logs/upsuider-backend-out.log',
      error_file: '/home/wiimdy/.pm2/logs/upsuider-backend-error.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
