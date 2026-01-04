-- Rooms table
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gm_key_hash TEXT NOT NULL,
  current_background_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Participants table
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PL' CHECK (role IN ('PL', 'GM')),
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'public' CHECK (channel IN ('public', 'secret', 'chat')),
  secret_allow_list UUID[] DEFAULT '{}',
  type TEXT NOT NULL DEFAULT 'speech' CHECK (type IN ('speech', 'mono', 'system', 'dice')),
  speaker_name TEXT NOT NULL,
  speaker_portrait_url TEXT,
  text TEXT NOT NULL,
  dice_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Characters table
CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  owner_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_npc BOOLEAN NOT NULL DEFAULT false,
  stats JSONB NOT NULL DEFAULT '{"STR":10,"CON":10,"POW":10,"DEX":10,"APP":10,"SIZ":10,"INT":10,"EDU":10}',
  derived JSONB NOT NULL DEFAULT '{"HP":10,"MP":10,"SAN":50,"DB":"0"}',
  skills JSONB NOT NULL DEFAULT '{}',
  items TEXT[] DEFAULT '{}',
  memo TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Assets table (portraits, backgrounds)
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('portrait', 'background')),
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  layer_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Macros table (GM text templates)
CREATE TABLE public.macros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'GM' CHECK (scope IN ('GM', 'ALL')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Stage state table (current scene state)
CREATE TABLE public.stage_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE UNIQUE,
  background_url TEXT,
  active_portraits JSONB NOT NULL DEFAULT '[]',
  is_secret BOOLEAN NOT NULL DEFAULT false,
  secret_allow_list UUID[] DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_states ENABLE ROW LEVEL SECURITY;

-- Public access policies (simplified for session-based auth)
-- Rooms: anyone can read and create
CREATE POLICY "Anyone can view rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.rooms FOR UPDATE USING (true);

-- Participants: room participants can view all in same room
CREATE POLICY "Anyone can view participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Anyone can join as participant" ON public.participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update participants" ON public.participants FOR UPDATE USING (true);
CREATE POLICY "Anyone can leave" ON public.participants FOR DELETE USING (true);

-- Messages: room participants can view/create
CREATE POLICY "Anyone can view messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Anyone can create messages" ON public.messages FOR INSERT WITH CHECK (true);

-- Characters: room participants can CRUD
CREATE POLICY "Anyone can view characters" ON public.characters FOR SELECT USING (true);
CREATE POLICY "Anyone can create characters" ON public.characters FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update characters" ON public.characters FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete characters" ON public.characters FOR DELETE USING (true);

-- Assets: room participants can CRUD
CREATE POLICY "Anyone can view assets" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Anyone can create assets" ON public.assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update assets" ON public.assets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete assets" ON public.assets FOR DELETE USING (true);

-- Macros: room participants can CRUD
CREATE POLICY "Anyone can view macros" ON public.macros FOR SELECT USING (true);
CREATE POLICY "Anyone can create macros" ON public.macros FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update macros" ON public.macros FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete macros" ON public.macros FOR DELETE USING (true);

-- Stage states
CREATE POLICY "Anyone can view stage states" ON public.stage_states FOR SELECT USING (true);
CREATE POLICY "Anyone can create stage states" ON public.stage_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stage states" ON public.stage_states FOR UPDATE USING (true);

-- Enable realtime for messages and stage_states
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.stage_states REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;

-- Create indexes for performance
CREATE INDEX idx_messages_room_id ON public.messages(room_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_participants_room_id ON public.participants(room_id);
CREATE INDEX idx_characters_room_id ON public.characters(room_id);
CREATE INDEX idx_assets_room_id ON public.assets(room_id);
CREATE INDEX idx_macros_room_id ON public.macros(room_id);