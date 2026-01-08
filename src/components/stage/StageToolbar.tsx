import { useEffect, useMemo, useState } from 'react';
import { Book, Download, ScrollText, Info, ChevronLeft, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { exportReplay } from '@/lib/replayExport';
import { getDisplayText } from '@/lib/expressionTag';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import type { Room, Message, StageState, Participant, Character } from '@/types/trpg';

interface StageToolbarProps {
  room: Room | null;
  messages: Message[];
  stageState: StageState | null;
  participants: Participant[];
  participant: Participant | null;
  isGM: boolean;
  canViewSecret?: boolean;
  characters: Character[];
  onUpdateRoom: (updates: Partial<Room>) => void;
}

export function StageToolbar({
  room,
  messages,
  stageState,
  participants,
  participant,
  isGM,
  canViewSecret = false,
  characters,
  onUpdateRoom,
}: StageToolbarProps) {
  const [showHouseRules, setShowHouseRules] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [houseRulesEdit, setHouseRulesEdit] = useState(room?.house_rules || '');
  const [isEditing, setIsEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoItems, setInfoItems] = useState<any[]>([]);
  const [selectedInfoId, setSelectedInfoId] = useState<string | null>(null);
  const [selectedInfoContent, setSelectedInfoContent] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteComments, setNoteComments] = useState<Record<string, any[]>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, any>>({});
  const [infoTitle, setInfoTitle] = useState('');
  const [infoContent, setInfoContent] = useState('');
  const [infoVisibility, setInfoVisibility] = useState<'public' | 'restricted' | 'gm_only'>('public');
  const [infoListVisibility, setInfoListVisibility] = useState<'hidden' | 'title'>('title');
  const [infoAllowedUsers, setInfoAllowedUsers] = useState<string[]>([]);
  const [showInfoCreate, setShowInfoCreate] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteShared, setNoteShared] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [infoImageFiles, setInfoImageFiles] = useState<File[]>([]);
  const [infoImages, setInfoImages] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const infoById = useMemo(() => {
    const map: Record<string, any> = {};
    infoItems.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, [infoItems]);

  const canViewInfoContent = (info: any) => {
    if (!info) return false;
    if (isGM) return true;
    if (info.visibility === 'public') return true;
    if (info.visibility === 'restricted') {
      return Array.isArray(info.allowed_user_ids) && currentUserId
        ? info.allowed_user_ids.includes(currentUserId)
        : false;
    }
    return false;
  };

  const canSeeInfoInList = (info: any) => {
    if (!info) return false;
    if (isGM) return true;
    if (info.visibility === 'public') return true;
    if (info.visibility === 'restricted') {
      if (info.list_visibility === 'title') return true;
      return Array.isArray(info.allowed_user_ids) && currentUserId
        ? info.allowed_user_ids.includes(currentUserId)
        : false;
    }
    if (info.visibility === 'gm_only') {
      return info.list_visibility === 'title';
    }
    return false;
  };

  const loadMemberProfiles = async () => {
    if (!room) return;
    const { data: members } = await supabase
      .from('room_members')
      .select('user_id, role')
      .eq('room_id', room.id);
    const ids = (members || [])
      .map((m: any) => m.user_id)
      .filter((id: string | null) => !!id) as string[];
    if (!ids.length) return;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, handle')
      .in('id', ids);
    const map: Record<string, any> = {};
    (profiles || []).forEach((p: any) => {
      map[p.id] = p;
    });
    setMemberProfiles(map);
  };

  const loadInfoList = async () => {
    if (!room) return;
    setInfoLoading(true);
    const { data, error } = await supabase
      .from('session_infos')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: '情報の取得に失敗しました', variant: 'destructive' });
    } else {
      setInfoItems(data || []);
    }
    setInfoLoading(false);
  };

  const loadInfoDetail = async (infoId: string) => {
    setSelectedInfoId(infoId);
    setSelectedInfoContent(null);
    setNotes([]);
    setNoteComments({});
    setInfoImages([]);
    const info = infoById[infoId];
    if (!info || !canViewInfoContent(info)) return;
    const { data: contentRow } = await supabase
      .from('session_info_contents')
      .select('content')
      .eq('info_id', infoId)
      .maybeSingle();
    setSelectedInfoContent(contentRow?.content ?? '');
    const { data: imageRows } = await supabase
      .from('session_info_images')
      .select('*')
      .eq('info_id', infoId)
      .order('sort_order', { ascending: true });
    setInfoImages(imageRows || []);
    const { data: noteRows } = await supabase
      .from('session_info_notes')
      .select('*')
      .eq('info_id', infoId)
      .order('created_at', { ascending: true });
    const notesList = noteRows || [];
    setNotes(notesList);
    if (notesList.length) {
      const noteIds = notesList.map((n: any) => n.id);
      const { data: commentRows } = await supabase
        .from('session_info_note_comments')
        .select('*')
        .in('note_id', noteIds)
        .order('created_at', { ascending: true });
      const grouped: Record<string, any[]> = {};
      (commentRows || []).forEach((c: any) => {
        if (!grouped[c.note_id]) grouped[c.note_id] = [];
        grouped[c.note_id].push(c);
      });
      setNoteComments(grouped);
    }
  };

  const resetInfoCreate = () => {
    setInfoTitle('');
    setInfoContent('');
    setInfoVisibility('public');
    setInfoListVisibility('title');
    setInfoAllowedUsers([]);
    setInfoImageFiles([]);
  };

  const handleCreateInfo = async () => {
    if (!room) return;
    if (!infoTitle.trim()) {
      toast({ title: 'タイトルを入力してください', variant: 'destructive' });
      return;
    }
    const { data: infoRow, error } = await supabase
      .from('session_infos')
      .insert({
        room_id: room.id,
        title: infoTitle.trim(),
        visibility: infoVisibility,
        list_visibility: infoListVisibility,
        allowed_user_ids: infoAllowedUsers,
        created_by: currentUserId,
      })
      .select('*')
      .single();
    if (error || !infoRow) {
      toast({ title: '情報の作成に失敗しました', variant: 'destructive' });
      return;
    }
    const { error: contentError } = await supabase
      .from('session_info_contents')
      .insert({ info_id: infoRow.id, content: infoContent });
    if (contentError) {
      toast({ title: '情報の本文保存に失敗しました', variant: 'destructive' });
      return;
    }
    if (infoImageFiles.length) {
      let order = 0;
      for (const file of infoImageFiles) {
        if (!file.type.startsWith('image/')) continue;
        const url = await uploadFile(file, `session-info/${room.id}`);
        if (!url) {
          toast({ title: '画像のアップロードに失敗しました', variant: 'destructive' });
          return;
        }
        await supabase.from('session_info_images').insert({
          info_id: infoRow.id,
          url,
          label: file.name.replace(/\.[^.]+$/, ''),
          sort_order: order,
        });
        order += 1;
      }
    }
    resetInfoCreate();
    setShowInfoCreate(false);
    await loadInfoList();
  };

  const handleAddNote = async () => {
    if (!selectedInfoId || !currentUserId) return;
    const text = noteText.trim();
    if (!text) return;
    const { error } = await supabase
      .from('session_info_notes')
      .insert({
        info_id: selectedInfoId,
        author_user_id: currentUserId,
        content: text,
        visibility: noteShared ? 'shared' : 'private',
      });
    if (error) {
      toast({ title: 'メモの保存に失敗しました', variant: 'destructive' });
      return;
    }
    setNoteText('');
    setNoteShared(false);
    await loadInfoDetail(selectedInfoId);
  };

  const handleAddComment = async (noteId: string, comment: string) => {
    if (!currentUserId || !comment.trim()) return;
    const { error } = await supabase
      .from('session_info_note_comments')
      .insert({
        note_id: noteId,
        author_user_id: currentUserId,
        content: comment.trim(),
      });
    if (error) {
      toast({ title: 'コメントの保存に失敗しました', variant: 'destructive' });
      return;
    }
    await loadInfoDetail(selectedInfoId || '');
  };

  const handleSelectInfoImages = (files: FileList | null) => {
    if (!files) return;
    const next: File[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) next.push(file);
    });
    if (!next.length) return;
    setInfoImageFiles((prev) => [...prev, ...next]);
  };

  useEffect(() => {
    if (!showInfo || !room) return;
    loadInfoList();
    loadMemberProfiles();
    setSelectedInfoId(null);
    setSelectedInfoContent(null);
    setShowInfoCreate(false);
  }, [showInfo, room?.id]);

  const logMessages = messages.filter((msg) => {
    if (msg.channel === 'chat') return false;
    if (msg.channel !== 'secret') return true;
    if (isGM || canViewSecret) return true;
    if (!participant) return false;
    const allowList = Array.isArray(msg.secret_allow_list) ? msg.secret_allow_list : [];
    return allowList.includes(participant.id);
  });

  const handleSaveHouseRules = async () => {
    await onUpdateRoom({ house_rules: houseRulesEdit });
    setIsEditing(false);
  };

  const handleExportReplay = async () => {
    if (!room) return;
    
    setExporting(true);
    try {
      await exportReplay({
        room,
        messages,
        stageState,
        characters,
        participants,
        participantId: participant?.id,
        isGM,
      });
      toast({ title: 'リプレイをエクスポートしました' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'エクスポートに失敗しました', variant: 'destructive' });
    }
    setExporting(false);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-border/30">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={() => setShowHouseRules(true)}
        >
          <Book className="w-3 h-3 mr-1" />
          ルール
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={() => setShowInfo(true)}
        >
          <Info className="w-3 h-3 mr-1" />
          情報
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={() => setShowLog(true)}
        >
          <ScrollText className="w-3 h-3 mr-1" />
          ログ
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={handleExportReplay}
          disabled={exporting}
        >
          <Download className="w-3 h-3 mr-1" />
          {exporting ? '...' : 'リプレイ'}
        </Button>
      </div>

      {/* House Rules Dialog */}
      <Dialog open={showHouseRules} onOpenChange={setShowHouseRules}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5" />
              ハウスルール
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {isEditing ? (
              <Textarea
                value={houseRulesEdit}
                onChange={(e) => setHouseRulesEdit(e.target.value)}
                className="min-h-[200px]"
                placeholder="このセッションのハウスルールを入力..."
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm">
                {room?.house_rules || 'ハウスルールは設定されていません'}
              </div>
            )}
          </ScrollArea>
          {isGM && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>キャンセル</Button>
                  <Button onClick={handleSaveHouseRules}>保存</Button>
                </>
              ) : (
                <Button onClick={() => { setHouseRulesEdit(room?.house_rules || ''); setIsEditing(true); }}>
                  編集
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              情報
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {selectedInfoId ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between gap-2 pb-2 border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => setSelectedInfoId(null)}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    一覧へ戻る
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    {infoById[selectedInfoId]?.visibility === 'public' && '全体公開'}
                    {infoById[selectedInfoId]?.visibility === 'restricted' && '制限付き'}
                    {infoById[selectedInfoId]?.visibility === 'gm_only' && 'GMのみ'}
                  </div>
                </div>
                <ScrollArea className="flex-1 pr-2">
                  <div className="space-y-4 py-4">
                    <div>
                      <h3 className="text-lg font-semibold">{infoById[selectedInfoId]?.title}</h3>
                      {!canViewInfoContent(infoById[selectedInfoId]) && (
                        <p className="text-sm text-muted-foreground mt-2">
                          この情報の内容を閲覧する権限がありません。
                        </p>
                      )}
                      {canViewInfoContent(infoById[selectedInfoId]) && (
                        <div className="whitespace-pre-wrap text-sm mt-3">
                          {selectedInfoContent ?? '読み込み中...'}
                        </div>
                      )}
                    </div>
                    {canViewInfoContent(infoById[selectedInfoId]) && infoImages.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">添付画像</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {infoImages.map((img: any) => (
                            <div key={img.id} className="border rounded-md overflow-hidden bg-secondary/20">
                              <img src={img.url} alt={img.label || 'info'} className="w-full h-auto object-contain" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {canViewInfoContent(infoById[selectedInfoId]) && (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold">メモ</div>
                        <div className="space-y-3">
                          {notes.map((note: any) => {
                            const author = memberProfiles[note.author_user_id];
                            const comments = noteComments[note.id] || [];
                            const commentText = commentDrafts[note.id] || '';
                            return (
                              <div key={note.id} className="border rounded-md p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <div>
                                    {author?.display_name || 'ユーザー'} {author?.handle ? `@${author.handle}` : ''}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {note.visibility === 'shared' && (
                                      <span className="inline-flex items-center gap-1">
                                        <Users className="w-3 h-3" />共有
                                      </span>
                                    )}
                                    {note.visibility === 'private' && (
                                      <span className="inline-flex items-center gap-1">
                                        <Lock className="w-3 h-3" />非公開
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-sm whitespace-pre-wrap">{note.content}</div>
                                {note.visibility === 'shared' && (
                                  <div className="space-y-2 pt-2 border-t">
                                    <div className="text-xs text-muted-foreground">コメント</div>
                                    <div className="space-y-2">
                                      {comments.map((c: any) => {
                                        const commentAuthor = memberProfiles[c.author_user_id];
                                        return (
                                          <div key={c.id} className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">
                                              {commentAuthor?.display_name || 'ユーザー'}
                                              {commentAuthor?.handle ? ` @${commentAuthor.handle}` : ''}
                                            </span>
                                            <span className="ml-2">{c.content}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <div className="flex gap-2">
                                      <Input
                                        value={commentText}
                                        onChange={(e) =>
                                          setCommentDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))
                                        }
                                        placeholder="コメントを追加..."
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          handleAddComment(note.id, commentText);
                                          setCommentDrafts((prev) => ({ ...prev, [note.id]: '' }));
                                        }}
                                      >
                                        送信
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="border rounded-md p-3 space-y-2">
                          <div className="text-xs text-muted-foreground">新しいメモ</div>
                          <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="min-h-[120px]"
                            placeholder="メモを入力..."
                          />
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox checked={noteShared} onCheckedChange={(checked) => setNoteShared(Boolean(checked))} />
                            他のPLに共有する
                          </label>
                          <div className="flex justify-end">
                            <Button size="sm" onClick={handleAddNote}>保存</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="text-sm text-muted-foreground">
                    セッション内で開示された情報
                  </div>
                  {isGM && (
                    <Button size="sm" onClick={() => { resetInfoCreate(); setShowInfoCreate(true); }}>
                      情報を追加
                    </Button>
                  )}
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="space-y-2 py-3">
                    {infoLoading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
                    {!infoLoading && infoItems.filter(canSeeInfoInList).length === 0 && (
                      <div className="text-sm text-muted-foreground">情報はまだありません。</div>
                    )}
                    {infoItems.filter(canSeeInfoInList).map((info) => (
                      <button
                        key={info.id}
                        className="w-full text-left px-3 py-2 rounded-md border hover:bg-secondary/40 transition"
                        onClick={() => loadInfoDetail(info.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{info.title}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            {info.visibility === 'public' && '全体公開'}
                            {info.visibility === 'restricted' && <><Users className="w-3 h-3" />制限付き</>}
                            {info.visibility === 'gm_only' && <><Lock className="w-3 h-3" />GMのみ</>}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                {showInfoCreate && isGM && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="text-sm font-semibold">新しい情報を追加</div>
                    <div className="space-y-2">
                      <Label>タイトル</Label>
                      <Input value={infoTitle} onChange={(e) => setInfoTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>内容</Label>
                      <Textarea
                        value={infoContent}
                        onChange={(e) => setInfoContent(e.target.value)}
                        className="min-h-[140px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>添付画像</Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => document.getElementById('info-image-input')?.click()}>
                          画像を追加
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {infoImageFiles.length ? `${infoImageFiles.length}枚選択中` : '未選択'}
                        </span>
                      </div>
                      <input
                        id="info-image-input"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleSelectInfoImages(e.target.files)}
                      />
                      {infoImageFiles.length > 0 && (
                        <div className="space-y-1">
                          {infoImageFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{file.name}</span>
                              <button
                                className="text-destructive"
                                type="button"
                                onClick={() =>
                                  setInfoImageFiles((prev) => prev.filter((_, i) => i !== index))
                                }
                              >
                                削除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>公開範囲</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={infoVisibility === 'public' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setInfoVisibility('public')}
                        >
                          全体公開
                        </Button>
                        <Button
                          variant={infoVisibility === 'restricted' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setInfoVisibility('restricted')}
                        >
                          制限付き
                        </Button>
                        <Button
                          variant={infoVisibility === 'gm_only' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setInfoVisibility('gm_only')}
                        >
                          GMのみ
                        </Button>
                      </div>
                    </div>
                    {infoVisibility !== 'public' && (
                      <div className="space-y-2">
                        <Label>一覧での表示</Label>
                        <div className="flex gap-2">
                          <Button
                            variant={infoListVisibility === 'title' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInfoListVisibility('title')}
                          >
                            タイトルだけ表示
                          </Button>
                          <Button
                            variant={infoListVisibility === 'hidden' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInfoListVisibility('hidden')}
                          >
                            存在も隠す
                          </Button>
                        </div>
                      </div>
                    )}
                    {infoVisibility === 'restricted' && (
                      <div className="space-y-2">
                        <Label>閲覧可能なプレイヤー</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-auto border rounded-md p-2">
                          {Object.values(memberProfiles).map((p: any) => (
                            <label key={p.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={infoAllowedUsers.includes(p.id)}
                                onCheckedChange={(checked) => {
                                  setInfoAllowedUsers((prev) => {
                                    if (checked) return [...prev, p.id];
                                    return prev.filter((id) => id !== p.id);
                                  });
                                }}
                              />
                              <span>{p.display_name} {p.handle ? `@${p.handle}` : ''}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowInfoCreate(false)}>キャンセル</Button>
                      <Button onClick={handleCreateInfo}>保存</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>セッションログ</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 text-sm">
              {logMessages.map((msg) => {
                const text = getDisplayText(msg.text);
                if (!text) return null;
                return (
                  <div key={msg.id} className="py-1 border-b border-border/30">
                    <span className="text-muted-foreground text-xs">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                    <span className="font-medium ml-2">{msg.speaker_name}:</span>
                    <span className="ml-2 whitespace-pre-wrap">{text}</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
