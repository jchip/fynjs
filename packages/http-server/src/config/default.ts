const DEFAULT_LISTEN_PORT = 3000;

const portFromEnv = (): number => {
  const x = parseInt(process.env.APP_SERVER_PORT || process.env.PORT, 10);
  return !isNaN(x) ? x : DEFAULT_LISTEN_PORT;
};

export default {
  server: {
    // options to pass to Fastify
  },

  connection: {
    host: process.env.HOST,
    address: process.env.HOST_IP || "0.0.0.0",
    port: portFromEnv()
  },

  plugins: {
    //
    // priority with lower value is higher
    //
    // "app-config": {
    //   priority: -9999,
    //   enable: true,
    //   options: {}
    // }
    //
  },

  electrode: {
    source: "default",
    hostIP: "127.0.0.1"
  }
};
