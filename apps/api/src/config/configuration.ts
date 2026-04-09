export default () => ({
  port: parseInt(process.env.API_PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME || 'gip-prod',
  },

  mysql: {
    host: process.env.MYSQL_HOST || '172.16.15.4',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'zwingroot',
    password: process.env.MYSQL_PASSWORD,
    masterDb: process.env.MYSQL_MASTER_DB || 'zwing',
  },

  ssh: {
    host: process.env.SSH_HOST || 'jh.ginesys.one',
    port: parseInt(process.env.SSH_PORT, 10) || 22,
    username: process.env.SSH_USERNAME || 'azureuser',
    keyPath: process.env.SSH_KEY_PATH || '/Users/rishabhshukla/.ssh/rishabh-macbook',
    localPort: parseInt(process.env.SSH_LOCAL_PORT, 10) || 13306,
  },
});



///Test 