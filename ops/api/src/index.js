import { createServer } from './server.js';

const PORT = Number(process.env.PORT || 3000);
const app = createServer();
app.listen(PORT, () => {
  console.log(`[ops-api] listening on ${PORT} (version=${process.env.APP_VERSION || 'dev'})`);
});
