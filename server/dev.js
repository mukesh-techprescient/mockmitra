import 'dotenv/config';
import { createApp } from './app.js';

const port = process.env.API_PORT || 8888; // not PORT: tools often set PORT for the web server
createApp().listen(port, () => console.log(`API on http://localhost:${port}/api`));
