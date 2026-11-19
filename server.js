import express from 'express';
import { neon } from '@neondatabase/serverless';
import { createApp } from './api/index.js';

const port = Number(process.env.PORT || 3000);
const app = createApp(neon(process.env.DATABASE_URL));
app.listen(port, () => console.log(`pastebin-lite listening on ${port}`));
