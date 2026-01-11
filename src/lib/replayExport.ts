import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Message, StageState, Character, Asset, Room, ReplayEvent, Participant } from '@/types/trpg';
import { supabase } from '@/integrations/supabase/client';
import { loadLocalStageEvents } from '@/lib/localStageEvents';
import { buildTitleScreenRenderList, hasTitleScreenConfig, loadTitleScreenConfig } from '@/lib/titleScreen';

interface ReplayData {
  room: Room;
  messages: Message[];
  stageState: StageState | null;
  characters: Character[];
  participants: Participant[];
  participantId?: string;
  isGM: boolean;
}

export async function exportReplay(data: ReplayData): Promise<void> {
  const { room, messages, stageState, characters, participants, participantId, isGM } = data;
  
  // Filter messages based on permissions
  const visibleMessages = messages.filter(msg => {
    if (msg.channel === 'public' || msg.channel === 'chat') return true;
    if (msg.channel === 'secret') {
      if (isGM) return true;
      if (participantId && msg.secret_allow_list.includes(participantId)) return true;
      return false;
    }
    return true;
  });

  // Fetch assets
  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .eq('room_id', room.id);

  const titleScreenConfig = loadTitleScreenConfig(room);
  const titleScreenRender = buildTitleScreenRenderList({
    config: titleScreenConfig,
    characters,
    assets: (assets || []) as Asset[],
  });
  const titleScreenEnabled = titleScreenRender.images.length > 0;

  // Fetch stage transition events (background/portraits)
  const { data: stageEvents, error: stageEventsError } = await supabase
    .from('stage_events')
    .select('*')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true });

  const toMs = (ts: string) => new Date(ts).getTime();
  const messageEvents: ReplayEvent[] = visibleMessages.map(msg => ({
    timestamp: msg.created_at,
    type: 'message',
    data: {
      messageId: msg.id,
      speaker: msg.speaker_name,
      text: msg.text,
      type: msg.type,
      portraitUrl: msg.speaker_portrait_url,
      dicePayload: msg.dice_payload,
      channel: msg.channel,
      secretAllowList: msg.secret_allow_list,
    },
  }));

  const localStageEvents = loadLocalStageEvents(room.id);
  const stageTransitionEvents: ReplayEvent[] = (stageEvents || []).map((ev: any) => ({
    timestamp: ev.created_at,
    type: ev.kind,
    data: ev.data,
  })) as any;

  const { data: logMarkups, error: logMarkupsError } = await supabase
    .from('room_log_markups')
    .select('id,room_id,message_id,label,created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true });

  // If stage_events is unavailable, fall back to locally recorded transitions
  const shouldUseLocalStageEvents =
    !!stageEventsError || !stageEvents || stageEvents.length === 0;
  const stageEventsForReplay: ReplayEvent[] = shouldUseLocalStageEvents
    ? (localStageEvents as any)
    : stageTransitionEvents;

  // Stable merge by timestamp; if equal, stage transitions go first.
  const events: ReplayEvent[] = [];
  let i = 0;
  let j = 0;
  while (i < stageEventsForReplay.length || j < messageEvents.length) {
    const a = stageEventsForReplay[i];
    const b = messageEvents[j];
    if (!b) {
      events.push(a);
      i++;
      continue;
    }
    if (!a) {
      events.push(b);
      j++;
      continue;
    }
    const ta = toMs(a.timestamp);
    const tb = toMs(b.timestamp);
    if (ta <= tb) {
      events.push(a);
      i++;
    } else {
      events.push(b);
      j++;
    }
  }

  // Collect image URLs to download
  const mediaUrls = new Set<string>();
  if (stageState?.background_url) mediaUrls.add(stageState.background_url);
  if (stageState?.active_portraits) {
    stageState.active_portraits.forEach((p: any) => {
      if (p?.url) mediaUrls.add(p.url);
    });
  }
  assets?.forEach(a => mediaUrls.add(a.url));
  if (titleScreenEnabled) {
    titleScreenRender.images.forEach((img) => mediaUrls.add(img.url));
    if (titleScreenRender.bgmUrl) mediaUrls.add(titleScreenRender.bgmUrl);
  }
  visibleMessages.forEach(m => {
    if (m.speaker_portrait_url) mediaUrls.add(m.speaker_portrait_url);
    // Audio commands embedded in text: [bgm:...] [se:...]
    if (typeof m.text === 'string') {
      const cmdRegex = /\[(bgm|se):([^\]]+)\]/gi;
      let match: RegExpExecArray | null = null;
      while ((match = cmdRegex.exec(m.text)) !== null) {
        const kind = String(match[1]).toLowerCase();
        const url = String(match[2] ?? '').trim();
        if (!url) continue;
        if (kind === 'bgm' && url.toLowerCase() === 'stop') continue;
        mediaUrls.add(url);
      }
    }
  });
  // stage events may include urls too
  events.forEach((ev) => {
    if (ev.type === 'background' && ev.data?.url) mediaUrls.add(ev.data.url);
    if (ev.type === 'portraits' && Array.isArray(ev.data?.portraits)) {
      ev.data.portraits.forEach((p: any) => {
        if (p?.url) mediaUrls.add(p.url);
      });
    }
  });

  // Create ZIP
  const zip = new JSZip();

  // Download images and add to assets folder
  const assetsFolder = zip.folder('assets');
  let imageIndex = 0;
  const urlToLocalPath = new Map<string, string>();
  for (const url of mediaUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const ext = url.split('.').pop()?.split('?')[0] || 'png';
        const fileName = `image_${imageIndex++}.${ext}`;
        assetsFolder?.file(fileName, blob);
        urlToLocalPath.set(url, `assets/${fileName}`);
      }
    } catch (e) {
      console.warn('Failed to download image:', url);
    }
  }

  const rewriteUrl = (url: string | null | undefined) => {
    if (!url) return url;
    return urlToLocalPath.get(url) || url;
  };

  const rewritePortraitsArray = (portraits: any[]) =>
    portraits.map((p: any) => ({ ...p, url: rewriteUrl(p?.url) }));

  const rewriteCommandUrlsInText = (text: any) => {
    if (typeof text !== 'string') return text;
    return text.replace(/\[(bgm|se):([^\]]+)\]/gi, (_m, kind, url) => {
      const k = String(kind).toLowerCase();
      const raw = String(url ?? '').trim();
      if (!raw) return `[${k}:]`;
      if (k === 'bgm' && raw.toLowerCase() === 'stop') return `[bgm:stop]`;
      return `[${k}:${rewriteUrl(raw)}]`;
    });
  };

  const rewrittenEvents: ReplayEvent[] = events.map((ev) => {
    if (ev.type === 'background') {
      return { ...ev, data: { ...ev.data, url: rewriteUrl(ev.data?.url) } } as any;
    }
    if (ev.type === 'portraits') {
      const portraits = Array.isArray(ev.data?.portraits) ? ev.data.portraits : [];
      return {
        ...ev,
        data: {
          ...ev.data,
          portraits: rewritePortraitsArray(portraits),
        },
      } as any;
    }
    if (ev.type === 'message') {
      return {
        ...ev,
        data: {
          ...ev.data,
          portraitUrl: rewriteUrl(ev.data?.portraitUrl),
          text: rewriteCommandUrlsInText(ev.data?.text),
        },
      } as any;
    }
    return ev;
  });

  const firstBackgroundFromEvents =
    rewrittenEvents.find(e => e.type === 'background' && e.data?.url)?.data?.url ?? null;
  const firstPortraitsFromEvents =
    rewrittenEvents.find(e => e.type === 'portraits' && Array.isArray(e.data?.portraits))?.data?.portraits ?? [];

  const rewrittenTitleScreen = titleScreenEnabled
    ? {
        ...titleScreenRender,
        images: (titleScreenRender.images || []).map((img) => ({
          ...img,
          url: rewriteUrl(img.url),
        })),
        bgmUrl: titleScreenRender.bgmUrl ? rewriteUrl(titleScreenRender.bgmUrl) : '',
      }
    : null;

  const fallbackInitialBackground =
    rewriteUrl(stageState?.background_url || null) || null;
  const fallbackInitialPortraits =
    stageState?.active_portraits ? rewritePortraitsArray(stageState.active_portraits as any) : [];

  // If stage_events is missing/empty, use snapshot fallback so replay isn't blank.
  const shouldUseSnapshotFallback = shouldUseLocalStageEvents && localStageEvents.length === 0;
  const initialBackground = shouldUseSnapshotFallback ? fallbackInitialBackground : firstBackgroundFromEvents;
  const initialPortraits = shouldUseSnapshotFallback ? fallbackInitialPortraits : firstPortraitsFromEvents;

  // Create replay JSON (after url rewrite)
  const replayJson = {
    roomId: room.id,
    roomName: room.name,
    exportedAt: new Date().toISOString(),
    events: rewrittenEvents,
    initialBackground,
    initialPortraits,
    characters: characters.map(c => ({ name: c.name, isNpc: c.is_npc })),
    participants: (participants || []).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    markups: (logMarkupsError ? [] : (logMarkups || [])).map((m: any) => ({
      id: m.id,
      messageId: m.message_id,
      label: m.label,
      createdAt: m.created_at,
    })),
    titleScreen: rewrittenTitleScreen,
  };
  const replayJsonString = JSON.stringify(replayJson, null, 2);

  // Generate HTML
  const html = generateReplayHtml(room.name, replayJsonString);
  const css = generateReplayCss();
  const js = generateReplayJs();

  zip.file('replay.html', html);
  zip.file('replay.css', css);
  zip.file('replay.js', js);
  zip.file('replay.json', replayJsonString);

  // Generate and download ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${room.name}_replay.zip`);
}

function generateReplayHtml(roomName: string, replayJsonString: string): string {
  const safeJson = replayJsonString.replace(/<\/script>/gi, "<\\/script>");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${roomName} - リプレイ</title>
  <link rel="stylesheet" href="replay.css">
</head>
<body>
  <div id="stage">
    <div id="background"></div>
    <div id="portraits"></div>
    <div id="choice-overlay" class="hidden"></div>
    <div id="title-screen" class="hidden">
      <div id="title-layer"></div>
      <div class="title-actions">
        <button id="btn-title-start">はじめから</button>
        <button id="btn-title-load">つづきから</button>
      </div>
    </div>
    <div id="text-window">
      <div id="controls">
        <button id="btn-auto" title="オート再生">▶</button>
        <button id="btn-log" title="バックログ">📜</button>
        <button id="btn-save" title="セーブ">💾</button>
        <button id="btn-load" title="ロード">📂</button>
      </div>
      <div id="speaker-name"></div>
      <div id="message-text"></div>
      <div id="click-hint">クリックまたはスペースで次へ</div>
    </div>
  </div>
  <div id="log-modal" class="modal hidden">
    <div class="modal-content">
      <h2>バックログ</h2>
      <div id="log-content"></div>
      <button id="close-log">閉じる</button>
    </div>
  </div>
  <div id="load-modal" class="modal hidden">
    <div class="modal-content">
      <h2>ロード</h2>
      <div id="load-content"></div>
      <button id="close-load">閉じる</button>
    </div>
  </div>
  <div id="save-modal" class="modal hidden">
    <div class="modal-content">
      <h2>セーブ</h2>
      <div id="save-content"></div>
      <button id="close-save">閉じる</button>
    </div>
  </div>
  <script id="replay-data" type="application/json">${safeJson}</script>
  <script src="replay.js"></script>
</body>
</html>`;
}

function generateReplayCss(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #0a0a0f;
  color: #e8e8e8;
  font-family: 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
  overflow: hidden;
}

#stage {
  width: 100vw;
  height: 100vh;
  position: relative;
}

#background {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transition: background-image 0.5s ease;
}

#portraits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#portraits img {
  position: absolute;
  bottom: 0;
  max-height: 70vh;
  object-fit: contain;
  transition: opacity 0.3s ease;
}

#portraits img.pos-left { left: 10%; }
#portraits img.pos-center { left: 35%; }
#portraits img.pos-right { left: 60%; }

#choice-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000; /* above text-window */
  pointer-events: auto;
}

#choice-overlay.hidden {
  display: none;
}

#title-screen {
  position: absolute;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

#title-screen.hidden {
  display: none;
}

#title-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.title-actions {
  position: relative;
  display: flex;
  gap: 16px;
  z-index: 1;
}

.title-actions button {
  padding: 12px 28px;
  font-size: 1.05em;
  font-weight: 700;
  border-radius: 999px;
  border: 1px solid rgba(168, 85, 247, 0.55);
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.28), rgba(17, 24, 39, 0.86));
  color: rgba(255,255,255,0.95);
  cursor: pointer;
}

.title-actions button:hover {
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.36), rgba(17, 24, 39, 0.86));
  border-color: rgba(216, 180, 254, 0.75);
}

.replay-choice-panel {
  width: min(720px, 92vw);
  padding: 18px 14px;
  border-radius: 18px;
  background: rgba(10, 12, 20, 0.35);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
}

#text-window {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30%;
  min-height: 200px;
  background: linear-gradient(to top, rgba(10,10,20,0.95), rgba(10,10,20,0.8));
  backdrop-filter: blur(10px);
  border-top: 2px solid rgba(138,43,226,0.5);
  padding: 20px 40px;
  cursor: pointer;
}

#text-window.hidden {
  display: none;
}

#controls {
  position: absolute;
  top: 10px;
  right: 20px;
  display: flex;
  gap: 10px;
}

#controls button {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

#controls button:hover {
  background: rgba(255,255,255,0.2);
}

#controls button.active {
  background: rgba(138,43,226,0.5);
}

#speaker-name {
  color: #bb86fc;
  font-size: 1.1em;
  margin-bottom: 10px;
  font-weight: bold;
}

#message-text {
  font-size: 1.2em;
  line-height: 1.8;
  color: #e8e8e8;
  min-height: 80px;
}

.replay-choice-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.replay-choice-btn {
  width: 100%;
  padding: 14px 18px;
  border-radius: 999px;
  border: 1px solid rgba(168, 85, 247, 0.55);
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.28), rgba(17, 24, 39, 0.86));
  box-shadow: 0 10px 26px rgba(0,0,0,0.35);
  color: rgba(255,255,255,0.95);
  font-size: 1.05em;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.replay-choice-btn:hover {
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.36), rgba(17, 24, 39, 0.86));
  border-color: rgba(216, 180, 254, 0.75);
}

#click-hint {
  position: absolute;
  bottom: 15px;
  right: 20px;
  font-size: 0.8em;
  color: rgba(255,255,255,0.4);
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal.hidden {
  display: none;
}

.modal-content {
  background: #1a1a2e;
  padding: 30px;
  border-radius: 10px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h2 {
  margin-bottom: 20px;
  color: #bb86fc;
}

#log-content {
  max-height: 50vh;
  overflow-y: auto;
  margin-bottom: 20px;
}

#log-content .log-entry {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

#log-content .log-speaker {
  color: #bb86fc;
  font-weight: bold;
}

#log-content .log-text {
  margin-top: 5px;
  color: #ccc;
  white-space: pre-wrap;
}

#log-content details.log-secret {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

#log-content details.log-secret > summary {
  color: rgba(187, 134, 252, 0.9);
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  list-style: none;
  outline: none;
}

#log-content details.log-secret > summary::-webkit-details-marker {
  display: none;
}

#log-content details.log-secret[open] > summary {
  margin-bottom: 8px;
}

#close-log {
  background: #bb86fc;
  border: none;
  color: #000;
  padding: 10px 30px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1em;
}

.dice-result {
  background: rgba(138,43,226,0.3);
  padding: 5px 10px;
  border-radius: 5px;
  font-family: monospace;
}

#load-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

#save-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.load-section-title {
  font-size: 0.95em;
  color: #bb86fc;
  margin-bottom: 8px;
}

.load-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  cursor: pointer;
  background: rgba(255,255,255,0.02);
}

.load-item:hover {
  background: rgba(255,255,255,0.08);
}

.load-item-title {
  font-size: 0.95em;
  color: #e8e8e8;
}

.load-item-meta {
  font-size: 0.8em;
  color: #b7b7b7;
}

.save-thumb {
  width: 120px;
  height: 68px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.save-thumb .save-portrait {
  position: absolute;
  bottom: 0;
  max-height: 100%;
  object-fit: contain;
}

.save-thumb .pos-left { left: 10%; }
.save-thumb .pos-center { left: 35%; }
.save-thumb .pos-right { left: 60%; }

.save-thumb img {
  position: absolute;
  bottom: 0;
  max-height: 100%;
  object-fit: contain;
}

#close-load {
  background: #bb86fc;
  border: none;
  color: #000;
  padding: 10px 30px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1em;
}

#close-save {
  background: #bb86fc;
  border: none;
  color: #000;
  padding: 10px 30px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1em;
}`;
}

function generateReplayJs(): string {
  return `(function() {
  let replayData = null;
  let steps = [];
  let currentIndex = 0;
  let messageIndexById = new Map();
  let autoPlay = false;
  let autoTimer = null;
  const bgmAudio = new Audio();
  bgmAudio.loop = true;
  const titleBgmAudio = new Audio();
  titleBgmAudio.loop = true;
  const seAudio = new Audio();
  let currentBgmUrl = null;
  let secretDecision = null; // 'view' | null
  let titleScreenActive = false;
  const SAVE_SLOTS = 6;
  const BASE_WIDTH = 1200;
  const BASE_HEIGHT = 675;
  let returnToTitleOnLoadClose = false;

  function showChoiceOverlay(buttons) {
    const overlay = document.getElementById('choice-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'replay-choice-panel';
    const list = document.createElement('div');
    list.className = 'replay-choice-list';
    (buttons || []).forEach((btn) => list.appendChild(btn));
    panel.appendChild(list);
    overlay.appendChild(panel);
  }

  function hideChoiceOverlay() {
    const overlay = document.getElementById('choice-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }

  function hasTitleScreenData() {
    const ts = replayData && replayData.titleScreen ? replayData.titleScreen : null;
    const images = ts && Array.isArray(ts.images) ? ts.images : [];
    return images.length > 0 || !!(ts && ts.bgmUrl);
  }

  function renderTitleScreenImages() {
    const layer = document.getElementById('title-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const ts = replayData && replayData.titleScreen ? replayData.titleScreen : null;
    const images = ts && Array.isArray(ts.images) ? ts.images : [];
    images.forEach((img) => {
      if (!img || !img.url) return;
      const node = document.createElement('div');
      node.style.position = 'absolute';
      const x = typeof img.x === 'number' ? img.x : 0;
      const y = typeof img.y === 'number' ? img.y : 0;
      node.style.left = (50 + x * 100) + '%';
      node.style.top = (50 + y * 100) + '%';
      node.style.transform = 'translate(-50%, -50%) rotate(' + (img.rotate || 0) + 'deg) scale(' + (img.scale || 1) + ')';
      node.style.transformOrigin = 'center';
      node.style.opacity = (typeof img.opacity === 'number') ? String(img.opacity) : '1';
      node.style.zIndex = String(img.z || 0);

      const image = document.createElement('img');
      image.src = img.url;
      image.alt = img.label || '';
      image.style.maxWidth = BASE_WIDTH + 'px';
      image.style.maxHeight = BASE_HEIGHT + 'px';
      image.style.objectFit = 'contain';
      node.appendChild(image);
      layer.appendChild(node);
    });
  }

  function setTitleScreenVisible(isVisible) {
    const title = document.getElementById('title-screen');
    const textWindow = document.getElementById('text-window');
    if (!title || !textWindow) return;
    if (isVisible) {
      title.classList.remove('hidden');
      textWindow.classList.add('hidden');
      const ts = replayData && replayData.titleScreen ? replayData.titleScreen : null;
      const bgm = ts && ts.bgmUrl ? String(ts.bgmUrl) : '';
      if (bgm) {
        if (titleBgmAudio.src !== bgm) titleBgmAudio.src = bgm;
        titleBgmAudio.play().catch(function(){});
      }
      try { bgmAudio.pause(); } catch (e) {}
    } else {
      title.classList.add('hidden');
      textWindow.classList.remove('hidden');
      try { titleBgmAudio.pause(); } catch (e) {}
    }
  }

  function getSaveStorageKey() {
    const roomId = replayData && replayData.roomId ? String(replayData.roomId) : '';
    const roomName = replayData && replayData.roomName ? String(replayData.roomName) : 'replay';
    return 'replay_saves_' + (roomId || roomName);
  }

  function loadSaveSlots() {
    try {
      const raw = localStorage.getItem(getSaveStorageKey());
      if (!raw) return Array.from({ length: SAVE_SLOTS }, () => null);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return Array.from({ length: SAVE_SLOTS }, () => null);
      const slots = Array.from({ length: SAVE_SLOTS }, (_, i) => parsed[i] || null);
      return slots;
    } catch (e) {
      return Array.from({ length: SAVE_SLOTS }, () => null);
    }
  }

  function writeSaveSlots(slots) {
    try {
      localStorage.setItem(getSaveStorageKey(), JSON.stringify(slots));
    } catch (e) {}
  }

  function getStageSnapshot() {
    const step = steps[currentIndex];
    return {
      background: step && step.background ? step.background : null,
      portraits: step && Array.isArray(step.portraits) ? step.portraits : [],
    };
  }

  function renderSaveThumb(container, snapshot) {
    if (!container) return;
    container.innerHTML = '';
    if (!snapshot) return;
    if (snapshot.background) {
      container.style.backgroundImage = 'url(' + snapshot.background + ')';
    } else {
      container.style.backgroundImage = '';
    }
    const portraits = Array.isArray(snapshot.portraits) ? snapshot.portraits : [];
    portraits.forEach((p) => {
      if (!p || !p.url) return;
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.label || '';
      img.className = 'save-portrait pos-' + ((p.position === 'left' || p.position === 'right' || p.position === 'center') ? p.position : 'center');
      const scale = (typeof p.scale === 'number') ? p.scale : 1;
      const offsetX = (typeof p.offsetX === 'number') ? p.offsetX : 0;
      const offsetY = (typeof p.offsetY === 'number') ? p.offsetY : 0;
      const thumbScaleX = 120 / BASE_WIDTH;
      const thumbScaleY = 68 / BASE_HEIGHT;
      img.style.transform = 'translate(' + (offsetX * thumbScaleX) + 'px,' + (offsetY * thumbScaleY) + 'px) scale(' + scale + ')';
      container.appendChild(img);
    });
  }

  function applyAudioFromText(rawText) {
    if (typeof rawText !== 'string' || !rawText) return;
    const cmdRegex = /\\[(bgm|se):([^\\]]+)\\]/gi;
    let match = null;
    let lastBgm = null;
    const seTriggers = [];
    while ((match = cmdRegex.exec(rawText)) !== null) {
      const kind = String(match[1]).toLowerCase();
      const value = String(match[2] || '').trim();
      if (!value) continue;
      if (kind === 'bgm') lastBgm = value;
      if (kind === 'se') seTriggers.push(value);
    }
    if (lastBgm !== null) {
      if (String(lastBgm).toLowerCase() === 'stop') {
        try { bgmAudio.pause(); } catch(e) {}
        currentBgmUrl = null;
      } else if (currentBgmUrl !== lastBgm) {
        currentBgmUrl = lastBgm;
        bgmAudio.src = lastBgm;
        bgmAudio.play().catch(function(){});
      } else {
        bgmAudio.play().catch(function(){});
      }
    }
    if (seTriggers.length > 0) {
      const url = seTriggers[seTriggers.length - 1];
      try {
        seAudio.pause();
        seAudio.currentTime = 0;
      } catch (e) {}
      seAudio.src = url;
      seAudio.play().catch(function(){});
    }
  }

  function stripCommandsForDisplay(rawText) {
    const s = (typeof rawText === 'string') ? rawText : '';
    return s
      .replace(/\\{[^}]+\\}/g, '')
      .replace(/\\[(bg|bgm|se|portrait|speaker|npc_disclosure|effects_config|effects_other|portrait_transform):[^\\]]+\\]\\n?/gi, '')
      .trim();
  }

  function renderPortraits(portraits) {
    const container = document.getElementById('portraits');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(portraits)) return;
    const sorted = portraits.slice().sort((a, b) => (a.layerOrder || 0) - (b.layerOrder || 0));
    sorted.forEach((p) => {
      if (!p || !p.url) return;
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.label || '';
      const pos = (p.position === 'left' || p.position === 'center' || p.position === 'right') ? p.position : 'center';
      img.className = 'pos-' + pos;
      const scale = (typeof p.scale === 'number') ? p.scale : 1;
      const x = (typeof p.offsetX === 'number') ? p.offsetX : 0;
      const y = (typeof p.offsetY === 'number') ? p.offsetY : 0;
      img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      img.style.transformOrigin = 'bottom center';
      container.appendChild(img);
    });
  }

  function participantNamesForIds(ids) {
    const list = (replayData && Array.isArray(replayData.participants)) ? replayData.participants : [];
    const map = new Map(list.map(p => [String(p.id), String(p.name)]));
    return (Array.isArray(ids) ? ids : []).map((id) => map.get(String(id)) || String(id));
  }

  function buildSteps(data) {
    const out = [];
    let currentBg = data && data.initialBackground ? data.initialBackground : null;
    let currentPortraits = data && Array.isArray(data.initialPortraits) ? data.initialPortraits : [];
    let secretActive = false;
    let secretAllowList = [];

    const events = (data && Array.isArray(data.events)) ? data.events : [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;
      if (ev.type === 'background') {
        const url = ev.data && ev.data.url ? ev.data.url : null;
        currentBg = url;
        continue;
      }
      if (ev.type === 'portraits') {
        const portraits = ev.data && Array.isArray(ev.data.portraits) ? ev.data.portraits : [];
        currentPortraits = portraits;
        continue;
      }
      if (ev.type === 'secret') {
        const nextSecret = !!(ev.data && (ev.data.isSecret === true || ev.data.is_secret === true));
        const nextAllow = (ev.data && (ev.data.secretAllowList || ev.data.secret_allow_list)) || [];
        // When entering secret, insert a prompt step (novel-style)
        if (!secretActive && nextSecret) {
          out.push({
            kind: 'secret_prompt',
            timestamp: ev.timestamp,
            background: currentBg,
            portraits: currentPortraits,
            secretAllowList: Array.isArray(nextAllow) ? nextAllow : [],
          });
        }
        secretActive = nextSecret;
        secretAllowList = Array.isArray(nextAllow) ? nextAllow : [];
        continue;
      }
      if (ev.type === 'message') {
        out.push({
          kind: 'message',
          timestamp: ev.timestamp,
          background: currentBg,
          portraits: currentPortraits,
          secretActive: secretActive,
          secretAllowList: secretAllowList,
          message: ev.data,
          messageId: ev.data && ev.data.messageId ? ev.data.messageId : null,
        });
      }
    }

    return out;
  }

  function setError(message) {
    const el = document.getElementById('message-text');
    if (el) el.textContent = message;
    const sp = document.getElementById('speaker-name');
    if (sp) sp.textContent = '';
  }

  function initWithData(data) {
    replayData = data;
    steps = buildSteps(data);
    messageIndexById = new Map();
    steps.forEach((step, idx) => {
      if (step && step.kind === 'message' && step.messageId) {
        messageIndexById.set(String(step.messageId), idx);
      }
    });
    currentIndex = 0;

    if (hasTitleScreenData()) {
      renderTitleScreenImages();
      titleScreenActive = true;
      setTitleScreenVisible(true);
    }

    if (steps.length === 0) {
      // No message steps; show just initial state if any
      if (data && data.initialBackground) {
        document.getElementById('background').style.backgroundImage = 'url(' + data.initialBackground + ')';
      }
      if (data && Array.isArray(data.initialPortraits)) {
        renderPortraits(data.initialPortraits);
      }
      setError('（メッセージがありません）');
      return;
    }
    if (titleScreenActive) {
      if (data && data.initialBackground) {
        document.getElementById('background').style.backgroundImage = 'url(' + data.initialBackground + ')';
      }
      if (data && Array.isArray(data.initialPortraits)) {
        renderPortraits(data.initialPortraits);
      }
      return;
    }
    showStep(0);
  }

  // Load replay data (prefer embedded JSON for file:// compatibility)
  try {
    const embedded = document.getElementById('replay-data');
    if (embedded && embedded.textContent && embedded.textContent.trim()) {
      initWithData(JSON.parse(embedded.textContent));
    } else {
      fetch('replay.json')
        .then(res => res.json())
        .then(initWithData)
        .catch(() => setError('読み込みに失敗しました（ZIPを解凍して、フォルダごとローカルサーバで開いてください）'));
    }
  } catch (e) {
    setError('読み込みに失敗しました');
  }

  function showStep(index) {
    let idx = index;
    while (true) {
      if (!replayData || idx >= steps.length) {
        document.getElementById('message-text').textContent = '(終わり)';
        document.getElementById('speaker-name').textContent = '';
        stopAuto();
        return;
      }

      currentIndex = idx;
      const step = steps[idx];
      if (step.background) {
        document.getElementById('background').style.backgroundImage = 'url(' + step.background + ')';
      }
      renderPortraits(step.portraits || []);

      // Reset secret decision when leaving secret segment
      if (!step.secretActive) {
        secretDecision = null;
        hideChoiceOverlay();
      }

      if (step.kind === 'secret_prompt') {
        stopAuto();
        const names = participantNamesForIds(step.secretAllowList || []);
        const label = names.length > 0 ? ('プレイヤー：' + names.join('、')) : '（GMのみ）';
        // Do not show system speaker/text in replay window; choices are rendered on stage overlay.
        document.getElementById('speaker-name').textContent = '';
        document.getElementById('message-text').textContent = '';

        const btnView = document.createElement('button');
        btnView.textContent = '秘匿を見る（' + label + '）';
        btnView.className = 'replay-choice-btn';
        btnView.onclick = function() {
          secretDecision = 'view';
          hideChoiceOverlay();
          nextEvent();
        };

        const btnSkip = document.createElement('button');
        btnSkip.textContent = '秘匿後までスキップする';
        btnSkip.className = 'replay-choice-btn';
        btnSkip.onclick = function() {
          hideChoiceOverlay();
          // Jump to first non-secret message after this point
          for (let k = currentIndex + 1; k < steps.length; k++) {
            if (steps[k].kind === 'message' && !steps[k].secretActive) {
              showStep(k);
              return;
            }
          }
          showStep(steps.length);
        };

        showChoiceOverlay([btnView, btnSkip]);
        return;
      }

      if (step.secretActive && secretDecision !== 'view') {
        // Force prompt if user tries to enter secret without choosing
        const promptIndex = steps.findIndex((s, idx) => idx >= 0 && idx <= currentIndex && s.kind === 'secret_prompt' && s.timestamp <= step.timestamp);
        // If prompt exists before, go back to it; else just block.
        if (promptIndex >= 0) {
          showStep(promptIndex);
        }
        return;
      }

      if (step.kind !== 'message' || !step.message) {
        idx++;
        continue;
      }

      const { speaker, text, type, dicePayload } = step.message || {};

      // Hide internal/system-only messages from replay text/log. Effects (audio) still apply.
      if (speaker === 'システム') {
        const rawText = (typeof text === 'string') ? text : '';
        applyAudioFromText(rawText);
        idx++;
        continue;
      }

      document.getElementById('speaker-name').textContent = speaker || '';

      if (dicePayload) {
        const rolls = dicePayload.rolls ? dicePayload.rolls.join(', ') : '';
        if (dicePayload.blind) {
          const expr = dicePayload.expression || '';
          const thresholdLine = (dicePayload.threshold !== undefined) ? ('<div class="dice-threshold">(目標値: ' + dicePayload.threshold + ')</div>') : '';
          const nameLine = (dicePayload.skillName) ? ('<div class="dice-skill">' + dicePayload.skillName + '</div>') : '';
          document.getElementById('message-text').innerHTML =
            '<div class="dice-result">🎲 ' + expr + '</div>' + thresholdLine + nameLine;
        } else {
          let resultText = dicePayload.expression + ' → [' + rolls + '] = ' + dicePayload.total;
          if (dicePayload.result) {
            const resultLabels = { critical: 'クリティカル！', success: '成功', failure: '失敗', fumble: 'ファンブル！' };
            resultText += ' (' + (resultLabels[dicePayload.result] || dicePayload.result) + ')';
          }
          document.getElementById('message-text').innerHTML = '<span class="dice-result">🎲 ' + resultText + '</span>';
        }
        return;
      }

      const rawText = (typeof text === 'string') ? text : '';
      applyAudioFromText(rawText);
      const displayText = stripCommandsForDisplay(rawText);
      if (!displayText) {
        idx++;
        continue;
      }
      const style = type === 'mono' ? 'font-style: italic; color: #aaa;' : '';
      document.getElementById('message-text').innerHTML = '<span style="' + style + '">' + displayText + '</span>';
      return;
    }
  }

  function nextEvent() {
    if (!replayData) return;
    if (titleScreenActive) return;
    if (steps[currentIndex] && steps[currentIndex].kind === 'secret_prompt' && secretDecision !== 'view') {
      return;
    }
    if (currentIndex < steps.length - 1) {
      showStep(currentIndex + 1);
    }
  }

  function prevEvent() {
    if (!replayData) return;
    if (titleScreenActive) return;
    if (currentIndex > 0) {
      showStep(currentIndex - 1);
    }
  }

  function toggleAuto() {
    autoPlay = !autoPlay;
    document.getElementById('btn-auto').classList.toggle('active', autoPlay);
    if (autoPlay) {
      autoTimer = setInterval(nextEvent, 3000);
    } else {
      stopAuto();
    }
  }

  function stopAuto() {
    autoPlay = false;
    document.getElementById('btn-auto').classList.remove('active');
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function showLog() {
    const logContent = document.getElementById('log-content');
    logContent.innerHTML = '';

    function formatDice(dp) {
      if (!dp) return '';
      const rolls = dp.rolls ? dp.rolls.join(', ') : '';
      let resultText = dp.expression + ' → [' + rolls + '] = ' + dp.total;
      if (dp.result) {
        const resultLabels = { critical: 'クリティカル！', success: '成功', failure: '失敗', fumble: 'ファンブル！' };
        resultText += ' (' + (resultLabels[dp.result] || dp.result) + ')';
      }
      return '🎲 ' + resultText;
    }

    function makeEntry(index, speaker, text) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const sp = document.createElement('div');
      sp.className = 'log-speaker';
      sp.textContent = speaker || '';

      const tx = document.createElement('div');
      tx.className = 'log-text';
      tx.textContent = text || '';

      entry.appendChild(sp);
      entry.appendChild(tx);

      entry.onclick = () => {
        showStep(index);
        document.getElementById('log-modal').classList.add('hidden');
      };
      entry.style.cursor = 'pointer';
      return entry;
    }

    let secretDetails = null;

    function flushSecretDetails() {
      if (!secretDetails) return;
      logContent.appendChild(secretDetails);
      secretDetails = null;
    }

    for (let i = 0; i <= currentIndex && i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;

      if (step.kind === 'secret_prompt') continue;

      if (step.kind !== 'message' || !step.message) continue;
      const channel = step.message.channel || '';
      const speaker = step.message.speaker || '';
      if (speaker === 'システム') continue;

      let displayText = '';
      if (step.message.dicePayload) {
        displayText = formatDice(step.message.dicePayload);
      } else {
        const raw = (typeof step.message.text === 'string') ? step.message.text : '';
        displayText = stripCommandsForDisplay(raw);
      }
      if (!displayText) continue;

      const entry = makeEntry(i, speaker, displayText);
      const isSecret = channel === 'secret' || (!!(step.message.dicePayload && step.message.dicePayload.blind));

      if (isSecret) {
        if (!secretDetails) {
          secretDetails = document.createElement('details');
          secretDetails.className = 'log-secret';
          const summary = document.createElement('summary');
          summary.textContent = '秘匿（クリックで表示）';
          secretDetails.appendChild(summary);
        }
        secretDetails.appendChild(entry);
      } else {
        flushSecretDetails();
        logContent.appendChild(entry);
      }
    }
    flushSecretDetails();

    document.getElementById('log-modal').classList.remove('hidden');
  }

  function showSaveModal() {
    const modal = document.getElementById('save-modal');
    const content = document.getElementById('save-content');
    if (!modal || !content) return;
    content.innerHTML = '';
    const slots = loadSaveSlots();
    slots.forEach((slot, idx) => {
      const item = document.createElement('div');
      item.className = 'load-item';
      const thumb = document.createElement('div');
      thumb.className = 'save-thumb';
      if (slot && slot.snapshot) {
        renderSaveThumb(thumb, slot.snapshot);
      }
      item.appendChild(thumb);

      const textWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'load-item-title';
      title.textContent = 'スロット ' + (idx + 1);
      textWrap.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'load-item-meta';
      meta.textContent = slot && slot.savedAt ? new Date(slot.savedAt).toLocaleString() : '空き';
      textWrap.appendChild(meta);
      item.appendChild(textWrap);

      item.onclick = function() {
        const snapshot = getStageSnapshot();
        const updated = loadSaveSlots();
        updated[idx] = {
          index: currentIndex,
          savedAt: new Date().toISOString(),
          snapshot,
        };
        writeSaveSlots(updated);
        modal.classList.add('hidden');
      };
      content.appendChild(item);
    });

    modal.classList.remove('hidden');
  }

  function showLoadModal(fromTitle) {
    const modal = document.getElementById('load-modal');
    const content = document.getElementById('load-content');
    if (!modal || !content) return;
    content.innerHTML = '';

    const makeSection = function(title, nodes) {
      const wrapper = document.createElement('div');
      const heading = document.createElement('div');
      heading.className = 'load-section-title';
      heading.textContent = title;
      wrapper.appendChild(heading);
      (nodes || []).forEach((n) => wrapper.appendChild(n));
      content.appendChild(wrapper);
    };

    const makeItem = function(label, meta, onClick, snapshot, withThumb) {
      const item = document.createElement('div');
      item.className = 'load-item';
      if (withThumb !== false) {
        const thumb = document.createElement('div');
        thumb.className = 'save-thumb';
        if (snapshot) renderSaveThumb(thumb, snapshot);
        item.appendChild(thumb);
      }
      const textWrap = document.createElement('div');
      textWrap.style.display = 'flex';
      textWrap.style.flexDirection = 'column';
      textWrap.style.gap = '2px';
      const t = document.createElement('div');
      t.className = 'load-item-title';
      t.textContent = label;
      textWrap.appendChild(t);
      if (meta) {
        const m = document.createElement('div');
        m.className = 'load-item-meta';
        m.textContent = meta;
        textWrap.appendChild(m);
      }
      item.appendChild(textWrap);
      item.onclick = onClick;
      return item;
    };

    const slots = loadSaveSlots();
    const saveNodes = slots.map(function(slot, idx) {
      if (!slot) {
        return makeItem('スロット ' + (idx + 1), '空き', function() {});
      }
      return makeItem('スロット ' + (idx + 1), new Date(slot.savedAt).toLocaleString(), function() {
        titleScreenActive = false;
        returnToTitleOnLoadClose = false;
        setTitleScreenVisible(false);
        showStep(slot.index || 0);
        modal.classList.add('hidden');
      }, slot.snapshot);
    });
    makeSection('セーブデータ', saveNodes);

    const markups = (replayData && Array.isArray(replayData.markups)) ? replayData.markups : [];
    if (markups.length > 0) {
      const nodes = markups
        .map(function(m) {
          const idx = messageIndexById.get(String(m.messageId));
          if (idx === undefined) return null;
          const meta = m.createdAt ? new Date(m.createdAt).toLocaleString() : null;
          return makeItem(m.label || 'マークアップ', meta, function() {
            showStep(idx);
            modal.classList.add('hidden');
          }, null, false);
        })
        .filter(Boolean);
      makeSection('マークアップから再生', nodes);
    } else {
      makeSection('マークアップから再生', [
        makeItem('マークアップがありません', 'GMがログから追加できます', function() {}, null, false),
      ]);
    }

    returnToTitleOnLoadClose = !!fromTitle;
    modal.classList.remove('hidden');
  }

  // Event listeners
  document.getElementById('text-window').addEventListener('click', function(e) {
    if (titleScreenActive) return;
    if (e.target.closest('#controls')) return;
    stopAuto();
    nextEvent();
  });

  document.addEventListener('keydown', function(e) {
    if (titleScreenActive) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      stopAuto();
      nextEvent();
    } else if (e.key === 'ArrowLeft') {
      stopAuto();
      prevEvent();
    } else if (e.key === 'ArrowRight') {
      stopAuto();
      nextEvent();
    }
  });

  document.getElementById('btn-auto').addEventListener('click', toggleAuto);
  document.getElementById('btn-log').addEventListener('click', showLog);
  document.getElementById('btn-save').addEventListener('click', showSaveModal);
  document.getElementById('btn-load').addEventListener('click', function() { showLoadModal(false); });
  document.getElementById('close-log').addEventListener('click', function() {
    document.getElementById('log-modal').classList.add('hidden');
  });
  document.getElementById('close-load').addEventListener('click', function() {
    document.getElementById('load-modal').classList.add('hidden');
    if (returnToTitleOnLoadClose && titleScreenActive) {
      setTitleScreenVisible(true);
      returnToTitleOnLoadClose = false;
    }
  });
  document.getElementById('close-save').addEventListener('click', function() {
    document.getElementById('save-modal').classList.add('hidden');
  });
  document.getElementById('btn-title-start').addEventListener('click', function() {
    titleScreenActive = false;
    setTitleScreenVisible(false);
    showStep(0);
  });
  document.getElementById('btn-title-load').addEventListener('click', function() {
    if (!titleScreenActive) return;
    setTitleScreenVisible(false);
    showLoadModal(true);
  });
})();`;
}
