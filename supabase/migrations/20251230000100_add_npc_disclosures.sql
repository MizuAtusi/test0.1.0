-- NPC disclosure settings (what PLs can see for each NPC)
CREATE TABLE IF NOT EXISTS public.npc_disclosures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  show_stats BOOLEAN NOT NULL DEFAULT false,
  show_derived BOOLEAN NOT NULL DEFAULT false,
  show_skills BOOLEAN NOT NULL DEFAULT false,
  show_memo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, character_id)
);

ALTER TABLE public.npc_disclosures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view npc disclosures" ON public.npc_disclosures FOR SELECT USING (true);
CREATE POLICY "Anyone can create npc disclosures" ON public.npc_disclosures FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update npc disclosures" ON public.npc_disclosures FOR UPDATE USING (true);

-- (Optional) realtime
ALTER TABLE public.npc_disclosures REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_disclosures;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

