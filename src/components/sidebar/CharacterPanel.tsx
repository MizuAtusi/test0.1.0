import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Plus, User, Shield, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CharacterSheet } from './CharacterSheet';
import { CharacterCreateDialog } from './CharacterCreateDialog';
import { AvatarEditorDialog } from './AvatarEditorDialog';
import { getCharacterAvatarUrl } from '@/lib/characterAvatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { buildNpcDisclosureCommand, loadNpcDisclosure, saveNpcDisclosure, type NpcDisclosureSettings } from '@/lib/npcDisclosures';
import type { Character, Participant } from '@/types/trpg';
import { Input } from '@/components/ui/input';

interface CharacterPanelProps {
  roomId: string;
  characters: Character[];
  participant: Participant | null;
  isGM: boolean;
  onRefresh: () => void;
}

function UndisclosedNpcRow({ character }: { character: Character }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-sidebar-accent/40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sidebar-foreground">{character.name}</p>
          <p className="text-xs text-muted-foreground">未開示</p>
        </div>
      </div>
    </div>
  );
}

type CharacterListItemProps = {
  roomId: string;
  character: Character;
  isGM: boolean;
  editable: boolean;
  isExpanded: boolean;
  setExpanded: (open: boolean) => void;
  npcCanOpen: boolean;
  npcDisclosure: NpcDisclosureSettings | null;
  onUpdateNpcDisclosure?: (patch: Partial<NpcDisclosureSettings>) => void;
  onOpenAvatarEditor: () => void;
  onUpdate: () => void;
  editingNameActive: boolean;
  editingNameValue: string;
  setEditingNameValue: (v: string) => void;
  editingNameComposing: boolean;
  setEditingNameComposing: (v: boolean) => void;
  commitAfterCompositionRef: MutableRefObject<boolean>;
  onStartEditingName: () => void;
  onCommitEditingName: () => void;
  onCancelEditingName: () => void;
};

function CharacterListItem({
  character,
  isGM,
  editable,
  isExpanded,
  setExpanded,
  npcCanOpen,
  npcDisclosure,
  onUpdateNpcDisclosure,
  onOpenAvatarEditor,
  onUpdate,
  editingNameActive,
  editingNameValue,
  setEditingNameValue,
  editingNameComposing,
  setEditingNameComposing,
  commitAfterCompositionRef,
  onStartEditingName,
  onCommitEditingName,
  onCancelEditingName,
  roomId,
}: CharacterListItemProps) {
  const canShowDerived = !character.is_npc || isGM || !!npcDisclosure?.showDerived;

  if (character.is_npc && !isGM && !npcCanOpen) {
    return <UndisclosedNpcRow character={character} />;
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setExpanded}>
      <div
        className="flex items-center justify-between p-3 hover:bg-sidebar-accent rounded-lg cursor-pointer transition-colors"
        onClick={() => {
          if (!npcCanOpen) return;
          if (editingNameActive) return;
          setExpanded(!isExpanded);
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 ${editable ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'}`}
            title={editable ? 'クリックしてアイコン設定' : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!editable) return;
              onOpenAvatarEditor();
            }}
          >
            {(character.avatar_url || getCharacterAvatarUrl(character.id)) ? (
              <img
                src={character.avatar_url || getCharacterAvatarUrl(character.id) || ''}
                alt={character.name}
                className="w-full h-full object-cover"
              />
            ) : character.is_npc ? (
              <Shield className="w-4 h-4 text-primary" />
            ) : (
              <User className="w-4 h-4 text-primary" />
            )}
          </button>
          <div>
            {editingNameActive ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  className="h-7 px-2 text-sm"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onCompositionStart={() => {
                    setEditingNameComposing(true);
                  }}
                  onCompositionEnd={() => {
                    setEditingNameComposing(false);
                    if (commitAfterCompositionRef.current) {
                      commitAfterCompositionRef.current = false;
                      onCommitEditingName();
                    }
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if ((e.nativeEvent as any)?.isComposing || editingNameComposing) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onCommitEditingName();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      onCancelEditingName();
                    }
                  }}
                  onBlur={() => {}}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommitEditingName();
                  }}
                  title="保存"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelEditingName();
                  }}
                  title="キャンセル"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className={`font-medium text-sidebar-foreground text-left ${editable ? 'hover:underline' : ''}`}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEditingName();
                }}
                title={editable ? 'クリックして名前編集' : undefined}
              >
                {character.name}
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              {character.is_npc && !isGM && !canShowDerived ? '未開示' : `HP: ${character.derived.HP} / SAN: ${character.derived.SAN}`}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <CollapsibleContent>
        <div className="px-3 pb-3">
          <CharacterSheet
            character={character}
            editable={editable}
            isGM={isGM}
            roomId={roomId}
            onUpdate={onUpdate}
            npcDisclosure={npcDisclosure ?? undefined}
            onUpdateNpcDisclosure={onUpdateNpcDisclosure}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CharacterPanel({
  roomId,
  characters,
  participant,
  isGM,
  onRefresh,
}: CharacterPanelProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [avatarEditingCharacter, setAvatarEditingCharacter] = useState<Character | null>(null);
  const [npcDisclosureById, setNpcDisclosureById] = useState<Map<string, NpcDisclosureSettings>>(new Map());
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [editingNameComposing, setEditingNameComposing] = useState(false);
  const commitAfterCompositionRef = useRef(false);
  const { toast } = useToast();

  const pcCharacters = useMemo(() => characters.filter(c => !c.is_npc), [characters]);
  const npcCharacters = useMemo(() => characters.filter(c => c.is_npc), [characters]);
  const npcIdsKey = useMemo(
    () => npcCharacters.map(c => c.id).slice().sort().join('|'),
    [npcCharacters],
  );

  const defaultNpcDisclosure = useMemo<NpcDisclosureSettings>(
    () => ({ showStats: false, showDerived: false, showSkills: false, showMemo: false }),
    [],
  );

  useEffect(() => {
    const fetchNpcDisclosures = async () => {
      const { data, error } = await supabase
        .from('npc_disclosures')
        .select('character_id,show_stats,show_derived,show_skills,show_memo')
        .eq('room_id', roomId);
      if (error) {
        // Table may not exist if migrations aren't applied yet -> fallback to localStorage
        const map = new Map<string, NpcDisclosureSettings>();
        npcCharacters.forEach((c) => {
          map.set(c.id, loadNpcDisclosure(roomId, c.id));
        });
        setNpcDisclosureById(map);
        return;
      }
      const map = new Map<string, NpcDisclosureSettings>();
      (data as any[] | null)?.forEach((row) => {
        if (!row?.character_id) return;
        map.set(String(row.character_id), {
          showStats: !!row.show_stats,
          showDerived: !!row.show_derived,
          showSkills: !!row.show_skills,
          showMemo: !!row.show_memo,
        });
      });
      setNpcDisclosureById(map);
    };
    void fetchNpcDisclosures();
  }, [roomId, npcIdsKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>)?.detail;
      if (!detail || detail.roomId !== roomId) return;
      const characterId = String(detail.characterId || '');
      if (!characterId) return;
      setNpcDisclosureById((prev) => {
        const next = new Map(prev);
        next.set(characterId, loadNpcDisclosure(roomId, characterId));
        return next;
      });
    };
    window.addEventListener('trpg:npcDisclosureChanged', handler as any);
    return () => window.removeEventListener('trpg:npcDisclosureChanged', handler as any);
  }, [roomId]);

  const upsertNpcDisclosure = async (characterId: string, patch: Partial<NpcDisclosureSettings>) => {
    let prevValue: NpcDisclosureSettings | null = null;
    let nextValue: NpcDisclosureSettings | null = null;
    setNpcDisclosureById((prev) => {
      const next = new Map(prev);
      const current = next.get(characterId) ?? defaultNpcDisclosure;
      prevValue = current;
      nextValue = { ...current, ...patch };
      next.set(characterId, nextValue);
      return next;
    });

    if (!nextValue || !prevValue) return;
    const { error } = await supabase
      .from('npc_disclosures')
      .upsert(
        {
          room_id: roomId,
          character_id: characterId,
          show_stats: nextValue.showStats,
          show_derived: nextValue.showDerived,
          show_skills: nextValue.showSkills,
          show_memo: nextValue.showMemo,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'room_id,character_id' } as any,
      );

    if (error) {
      const msg = String(error.message || '');
      console.warn('npc_disclosures upsert failed; falling back:', error);

      // Fallback: localStorage + broadcast via system message so other clients can apply it.
      saveNpcDisclosure(roomId, characterId, nextValue);
      try {
        const command = buildNpcDisclosureCommand(characterId, nextValue);
        const { error: msgError } = await supabase.from('messages').insert({
          room_id: roomId,
          type: 'system',
          speaker_name: 'システム',
          channel: 'public',
          secret_allow_list: [],
          text: command,
        } as any);
        if (!msgError) {
          toast({ title: '保存しました（互換モード）' });
          return;
        }
        console.warn('npc_disclosure broadcast message failed:', msgError);
      } catch (e) {
        console.warn('npc_disclosure broadcast message threw:', e);
      }

      // rollback optimistic update
      setNpcDisclosureById((prev) => {
        const next = new Map(prev);
        next.set(characterId, prevValue as NpcDisclosureSettings);
        return next;
      });
      toast({ title: 'NPC開示設定の保存に失敗しました', description: msg, variant: 'destructive' });
    }
  };

  const setExpanded = (id: string, open: boolean) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const canEdit = (char: Character) => {
    const myUserId = (participant as any)?.user_id as string | undefined;
    if (myUserId && (char as any).owner_user_id) return (char as any).owner_user_id === myUserId;
    return participant?.id === char.owner_participant_id;
  };

  const startEditingName = (character: Character) => {
    if (!canEdit(character)) return;
    setEditingNameId(character.id);
    setEditingNameValue(character.name);
  };

  const commitEditingName = async (character: Character) => {
    if (!canEdit(character)) return;
    const nextName = editingNameValue.trim();
    if (!nextName) {
      toast({ title: '名前を入力してください', variant: 'destructive' });
      return;
    }
    if (nextName === character.name) return;
    const { error } = await supabase
      .from('characters')
      .update({ name: nextName } as any)
      .eq('id', character.id);
    if (error) {
      toast({ title: '名前の更新に失敗しました', variant: 'destructive' });
      onRefresh();
      return;
    }
    toast({ title: '名前を更新しました' });
    setEditingNameId(null);
    setEditingNameValue('');
    setEditingNameComposing(false);
    commitAfterCompositionRef.current = false;
    onRefresh();
  };

  const cancelEditingName = () => {
    setEditingNameId(null);
    setEditingNameValue('');
    setEditingNameComposing(false);
    commitAfterCompositionRef.current = false;
  };

  const renderCharacter = (character: Character) => {
    const isExpanded = expandedIds.has(character.id);
    const editable = canEdit(character);
    const npcDisclosure = character.is_npc
      ? (npcDisclosureById.get(character.id) ?? defaultNpcDisclosure)
      : null;
    const npcCanOpen =
      !character.is_npc || isGM || !!(npcDisclosure?.showStats || npcDisclosure?.showDerived || npcDisclosure?.showSkills || npcDisclosure?.showMemo);
    return (
      <CharacterListItem
        key={character.id}
        roomId={roomId}
        character={character}
        isGM={isGM}
        editable={editable}
        isExpanded={isExpanded}
        setExpanded={(open) => setExpanded(character.id, open)}
        npcCanOpen={npcCanOpen}
        npcDisclosure={npcDisclosure}
        onUpdateNpcDisclosure={
          character.is_npc && isGM && editable ? (patch) => upsertNpcDisclosure(character.id, patch) : undefined
        }
        onOpenAvatarEditor={() => setAvatarEditingCharacter(character)}
        onUpdate={onRefresh}
        editingNameActive={editingNameId === character.id}
        editingNameValue={editingNameValue}
        setEditingNameValue={setEditingNameValue}
        editingNameComposing={editingNameComposing}
        setEditingNameComposing={setEditingNameComposing}
        commitAfterCompositionRef={commitAfterCompositionRef}
        onStartEditingName={() => startEditingName(character)}
        onCommitEditingName={() => void commitEditingName(character)}
        onCancelEditingName={cancelEditingName}
      />
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-sidebar-border">
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="w-full bg-primary hover:bg-primary/80"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          キャラクター作成
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* PC Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              プレイヤーキャラクター ({pcCharacters.length})
            </h3>
            <div className="space-y-1">
              {pcCharacters.map(char => (
                renderCharacter(char)
              ))}
              {pcCharacters.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  PCがいません
                </p>
              )}
            </div>
          </div>

          {/* NPC Section */}
          {(isGM || npcCharacters.length > 0) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                NPC ({npcCharacters.length})
              </h3>
              <div className="space-y-1">
                {npcCharacters.map(char => (
                  renderCharacter(char)
                ))}
                {npcCharacters.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    NPCがいません
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <CharacterCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        roomId={roomId}
        participantId={participant?.id}
        ownerUserId={(participant as any)?.user_id ?? null}
        isGM={isGM}
        onCreated={onRefresh}
      />

      {avatarEditingCharacter && (
        <AvatarEditorDialog
          open={!!avatarEditingCharacter}
          onOpenChange={(open) => {
            if (!open) setAvatarEditingCharacter(null);
          }}
          character={avatarEditingCharacter}
          editable={canEdit(avatarEditingCharacter)}
          onUpdated={onRefresh}
        />
      )}
    </div>
  );
}
