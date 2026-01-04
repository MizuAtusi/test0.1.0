import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MessageCircle, Wand2 } from 'lucide-react';
import { CharacterPanel } from './CharacterPanel';
import { ChatPanel } from './ChatPanel';
import { GMToolsPanel } from './GMToolsPanel';
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
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState('characters');

  // Filter chat messages only
  const chatMessages = messages.filter(m => m.channel === 'chat');

  return (
    <div className="h-full flex flex-col bg-sidebar border-l border-sidebar-border overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Fixed Tab Header */}
        <TabsList className="w-full justify-start rounded-none border-b border-sidebar-border bg-transparent p-0 shrink-0">
          <TabsTrigger 
            value="characters" 
            className="tab-gothic rounded-none data-[state=active]:bg-transparent"
          >
            <Users className="w-4 h-4 mr-2" />
            キャラクター
          </TabsTrigger>
          <TabsTrigger 
            value="chat" 
            className="tab-gothic rounded-none data-[state=active]:bg-transparent"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            チャット
          </TabsTrigger>
          {isGM && (
            <TabsTrigger 
              value="gm" 
              className="tab-gothic rounded-none data-[state=active]:bg-transparent"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              GM
            </TabsTrigger>
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
              messages={chatMessages}
              participant={participant}
              onSendMessage={(text) => {
                if (participant) {
                  onSendMessage('speech', text, participant.name, { channel: 'chat' });
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
              />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
