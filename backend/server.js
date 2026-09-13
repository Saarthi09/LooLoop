import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, supabaseConnected: Boolean(supabase) });
});

app.get('/api/events', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured. Add backend/.env first.' });

  const interests = String(req.query.interests || '')
    .split(',').map((interest) => interest.trim()).filter(Boolean);
  let query = supabase
    .from('events')
    .select('id, title, description, starts_at, ends_at, location, tags, capacity, image_url')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(30);
  if (interests.length) query = query.overlaps('tags', interests);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data });
});

app.post('/api/events', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured. Add backend/.env first.' });

  const { title, description, starts_at, ends_at, location, tags = [], capacity, image_url } = req.body;
  if (!title || !starts_at || !location) {
    return res.status(400).json({ error: 'title, starts_at, and location are required.' });
  }
  const { data, error } = await supabase
    .from('events')
    .insert({ title, description, starts_at, ends_at, location, tags, capacity, image_url })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
});

app.listen(port, () => console.log(`LooLoop API listening at http://localhost:${port}`));
