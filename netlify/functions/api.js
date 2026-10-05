import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';

// Figures (/api/assets/:id) are binary; without this they are sent as UTF-8 text and arrive corrupted.
export const handler = serverless(createApp(), { binary: ['image/*'] });
