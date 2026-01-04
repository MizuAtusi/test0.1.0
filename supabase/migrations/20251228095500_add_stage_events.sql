-- Stage events table (history for replay)
CREATE TABLE IF NOT EXISTS public.stage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('background', 'portraits', 'secret')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stage events" ON public.stage_events FOR SELECT USING (true);
CREATE POLICY "Anyone can create stage events" ON public.stage_events FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stage_events_room_id_created_at ON public.stage_events(room_id, created_at);

