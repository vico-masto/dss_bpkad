module.exports = {
  apps: [{
    name: 'dss-bpkad-backend',
    script: 'server.js',
    cwd: __dirname,
    watch: ['.'],
    ignore_watch: ['node_modules', '.git', 'logs', '*.log'],
    watch_delay: 1000,
    max_restarts: 10,
    restart_delay: 2000,
    min_uptime: '10s',
    autorestart: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      PORT: '5000'
    }
  }]
};
