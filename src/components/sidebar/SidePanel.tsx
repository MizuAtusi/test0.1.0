import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MessageCircle, Wand2, ChevronRight } from 'lucide-react';
import { CharacterPanel } from './CharacterPanel';
import { ChatPanel } from './ChatPanel';
import { GMToolsPanel } from './GMToolsPanel';
import { Button } from '@/components/ui/button';
import type { Character, Participant, Message, StageState, Room } from '@/types/trpg';

interface SidePanelProps {
  roomId: string;
  room: Room | null;
  participant: Participant | null;
  participants: Participant[];
  characters: Character[];
  messages: Message[];
  stageState: StageState | null;
  isGM: boolean;
  onRefreshCharacters: () => void;
  onSendMessage: (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    speakerName: string,
    options?: any
  ) => void;
  onUpdateStage: (updates: Partial<StageState>) => void;
  onUpdateRoom: (updates: Partial<Room>) => void;
  onCollapse?: () => void;
}

export function SidePanel({
  roomId,
  room,
  participant,
  participants,
  characters,
  messages,
  stageState,
  isGM,
  onRefreshCharacters,
  onSendMessage,
  onUpdateStage,
  onUpdateRoom,
  onCollapse,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState('characters');
  const [lastSeenChatAt, setLastSeenChatAt] = useState<number | null>(null);

  // Filter chat messages only
  const chatMessages = messages.filter(m => m.channel === 'chat');
  const lastChatMessage = chatMessages[chatMessages.length - 1];
  const lastChatTime = lastChatMessage ? new Date(lastChatMessage.created_at).getTime() : null;

  useEffect(() => {
    if (lastSeenChatAt === null) {
      setLastSeenChatAt(lastChatTime ?? Date.now());
    }
  }, [lastChatTime, lastSeenChatAt]);

  useEffect(() => {
    if (activeTab === 'chat') {
      setLastSeenChatAt(lastChatTime ?? Date.now());
    }
  }, [activeTab, lastChatTime]);

  const hasUnreadChat =
    activeTab !== 'chat' &&
    lastChatTime !== null &&
    lastSeenChatAt !== null &&
    lastChatTime > lastSeenChatAt;

  return (
    <div className="h-full flex flex-col bg-sidebar border-l border-sidebar-border overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Fixed Tab Header */}
        <TabsList className="w-full rounded-none border-b border-sidebar-border bg-transparent p-0 shrink-0 justify-start">
          <div className="flex items-stretch">
            <TabsTrigger 
              value="characters" 
              className="tab-gothic rounded-none data-[state=active]:bg-transparent"
            >
              <Users className="w-4 h-4 mr-2" />
              キャラクター
            </TabsTrigger>
            <TabsTrigger 
              value="chat" 
              className="relative tab-gothic rounded-none data-[state=active]:bg-transparent"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              チャット
              {hasUnreadChat && (
                <span className="absolute -top-1 right-2 h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </TabsTrigger>
            {isGM && (
              <TabsTrigger 
                value="gm" 
                className="tab-gothic rounded-none data-[state=active]:bg-transparent"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                KP
              </TabsTrigger>
            )}
          </div>
          {onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-10 w-10 rounded-none opacity-80 hover:opacity-100"
              onClick={onCollapse}
              title="サイドパネルを折りたたむ"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
        </TabsList>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <TabsContent value="characters" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <CharacterPanel
              roomId={roomId}
              characters={characters}
              participant={participant}
              isGM={isGM}
              onRefresh={onRefreshCharacters}
            />
          </TabsContent>

          <TabsContent value="chat" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <ChatPanel
              roomId={roomId}
              messages={chatMessages}
              participant={participant}
              onSendMessage={(text, options) => {
                if (participant) {
                  if (options?.dicePayload) {
                    onSendMessage('dice', text, participant.name, { channel: 'chat', dicePayload: options.dicePayload, threadId: options?.threadId });
                  } else {
                    onSendMessage('speech', text, participant.name, { channel: 'chat', threadId: options?.threadId });
                  }
                }
              }}
            />
          </TabsContent>

          {isGM && (
            <TabsContent value="gm" className="h-full m-0 p-0 data-[state=inactive]:hidden">
              <GMToolsPanel
                roomId={roomId}
                room={room}
                stageState={stageState}
                participants={participants}
                characters={characters}
                onSendMessage={onSendMessage}
                onUpdateStage={onUpdateStage}
                onUpdateRoom={onUpdateRoom}
                onRefreshCharacters={onRefreshCharacters}
              />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
