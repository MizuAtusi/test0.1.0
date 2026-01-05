import type { Message } from '@/types/trpg';
import { cn } from '@/lib/utils';
import { getDisplayText } from '@/lib/expressionTag';

interface MessageBubbleProps {
  message: Message;
  viewerParticipantId?: string | null;
}

export function MessageBubble({ message, viewerParticipantId = null }: MessageBubbleProps) {
  const getMessageStyle = () => {
    switch (message.type) {
      case 'speech':
        return 'message-speech';
      case 'mono':
        return 'message-mono';
      case 'system':
        return 'message-system';
      case 'dice':
        return 'message-dice';
      default:
        return '';
    }
  };

  const getDiceResultStyle = () => {
    if (!message.dice_payload?.result) return '';
    switch (message.dice_payload.result) {
      case 'critical':
        return 'dice-critical';
      case 'success':
        return 'dice-success';
      case 'failure':
        return 'dice-failure';
      case 'fumble':
        return 'dice-fumble';
      default:
        return '';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  if (message.type === 'system') {
    const display = getDisplayText(message.text);
    if (!display) return null;
    return (
      <div className={cn('animate-fade-in py-2', getMessageStyle())}>
        <span className="text-accent">⚡ {display}</span>
      </div>
    );
  }

  if (message.type === 'dice') {
    const payload = message.dice_payload;
    const allowList = Array.isArray(message.secret_allow_list) ? message.secret_allow_list : [];
    const canSeeFull = !payload?.blind || (viewerParticipantId ? allowList.includes(viewerParticipantId) : false);
    return (
      <div className={cn('animate-slide-up', getMessageStyle())}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm text-muted-foreground">{message.speaker_name}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
        </div>
        {canSeeFull ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-lg">🎲</span>
            <span className="font-mono text-foreground">
              {payload?.expression} → [{payload?.rolls?.join(', ')}] = {payload?.total}
            </span>
            {payload?.threshold !== undefined && (
              <>
                <span className="text-muted-foreground">(目標値: {payload.threshold})</span>
                {payload.skillName && (
                  <span className="px-2 py-0.5 rounded bg-secondary/40 text-foreground text-xs">
                    {payload.skillName}
                  </span>
                )}
                {payload.result && (
                  <span className={cn('dice-result', getDiceResultStyle())}>
                    {payload.result === 'critical' && 'クリティカル！'}
                    {payload.result === 'success' && '成功'}
                    {payload.result === 'failure' && '失敗'}
                    {payload.result === 'fumble' && 'ファンブル！'}
                  </span>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-lg">🎲</span>
              <span className="font-mono text-foreground">{payload?.expression ?? ''}</span>
            </div>
            {payload?.threshold !== undefined && (
              <div className="text-muted-foreground">(目標値: {payload.threshold})</div>
            )}
            {payload?.skillName && (
              <div className="text-foreground">{payload.skillName}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('animate-slide-up', getMessageStyle())}>
      <div className="flex items-center gap-3 mb-1">
        {message.speaker_portrait_url && (
          <img 
            src={message.speaker_portrait_url} 
            alt={message.speaker_name}
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        )}
        <span className="text-sm font-semibold text-primary">{message.speaker_name}</span>
        <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
        {message.channel === 'secret' && (
          <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">秘匿</span>
        )}
      </div>
      <p className={cn(
        'text-lg leading-relaxed',
        message.type === 'mono' ? 'italic text-muted-foreground' : 'text-foreground'
      )}>
        {getDisplayText(message.text)}
      </p>
    </div>
  );
}
