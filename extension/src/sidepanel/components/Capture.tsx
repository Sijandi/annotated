import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { LogOut, Loader2, ExternalLink } from 'lucide-react';
import { YouTubeClipper } from './YouTubeClipper';
import { ArticleHighlighter } from './ArticleHighlighter';
import { PodcastClipper } from './PodcastClipper';
import { Commentary, type CommentaryData } from './Commentary';

interface PageContext {
  url: string;
  title: string;
  sourceType: 'youtube' | 'article' | 'podcast' | 'unknown';
  metadata: {
    description?: string;
    author?: string;
    image?: string;
  };
  audioSrc?: string;
}

interface ClipState {
  sourceType: 'youtube' | 'article' | 'podcast';
  sourceUrl: string;
  sourceTitle: string;
  sourceAuthor?: string;
  sourceThumbnail?: string;
  clipStart?: number;
  clipEnd?: number;
  clipText?: string;
  audioSrc?: string;
  rawVideoBlob?: Blob;
}

type Step = 'capture' | 'recording' | 'commentary' | 'publishing' | 'done';

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

export function Capture({ session }: { session: Session }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [step, setStep] = useState<Step>('capture');
  const [clipState, setClipState] = useState<ClipState | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const webAppUrl = import.meta.env.VITE_WEB_APP_URL || '';

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('content script not ready:', chrome.runtime.lastError.message);
          return;
        }
        setPageContext(response);
      });
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const handleClipReady = async (data: { start: number; end: number; audioSrc?: string }) => {
    if (!pageContext) return;

    if (pageContext.sourceType === 'youtube') {
      // Capture video client-side
      setStep('recording');
      setError(null);
      try {
        const tab = await new Promise<chrome.tabs.Tab>((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => resolve(t));
        });
        if (!tab?.id) throw new Error('No active tab');

        const response = await new Promise<{ dataUrl?: string; error?: string }>((resolve, reject) => {
          chrome.tabs.sendMessage(tab.id!, { type: 'CAPTURE_VIDEO_CLIP', start: data.start, end: data.end }, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || 'Content script not responding'));
              return;
            }
            resolve(res);
          });
        });

        if (response?.error) throw new Error(response.error);
        if (!response?.dataUrl) throw new Error('No video data captured. Try refreshing the YouTube page and try again.');

        // Convert data URL to Blob
        const res = await fetch(response.dataUrl);
        const blob = await res.blob();

        if (blob.size < 1000) throw new Error('Captured clip is too small. The video may not have played correctly.');

        setClipState({
          sourceType: 'youtube',
          sourceUrl: pageContext.url,
          sourceTitle: pageContext.title,
          sourceAuthor: pageContext.metadata.author,
          sourceThumbnail: pageContext.metadata.image,
          clipStart: data.start,
          clipEnd: data.end,
          rawVideoBlob: blob,
        });
        setStep('commentary');
      } catch (err: any) {
        console.error('[annotated] capture failed:', err);
        setError(err.message || 'Failed to capture video clip');
        setStep('capture');
      }
    } else {
      // Podcast — worker downloads from audio src
      setClipState({
        sourceType: pageContext.sourceType as 'podcast',
        sourceUrl: pageContext.url,
        sourceTitle: pageContext.title,
        sourceAuthor: pageContext.metadata.author,
        sourceThumbnail: pageContext.metadata.image,
        clipStart: data.start,
        clipEnd: data.end,
        audioSrc: data.audioSrc,
      });
      setStep('commentary');
    }
  };

  const handleTextReady = (text: string) => {
    if (!pageContext) return;
    setClipState({
      sourceType: 'article',
      sourceUrl: pageContext.url,
      sourceTitle: pageContext.title,
      sourceAuthor: pageContext.metadata.author,
      sourceThumbnail: pageContext.metadata.image,
      clipText: text,
    });
    setStep('commentary');
  };

  const handlePublish = async (commentary: CommentaryData) => {
    if (!clipState) return;
    setStep('publishing');
    setError(null);

    try {
      const slug = generateSlug(clipState.sourceTitle);
      let commentaryAudioUrl: string | undefined;

      // Upload audio commentary if present
      if (commentary.audioBlob) {
        const filename = `${session.user.id}/${slug}-commentary.webm`;
        const { error: uploadErr } = await supabase.storage
          .from('commentary')
          .upload(filename, commentary.audioBlob, { contentType: 'audio/webm', upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('commentary')
          .getPublicUrl(filename);
        commentaryAudioUrl = urlData.publicUrl;
      }

      // Upload raw video clip if captured client-side
      let rawClipUrl: string | undefined;
      if (clipState.rawVideoBlob) {
        const rawFilename = `raw/${session.user.id}/${slug}.webm`;
        const { error: rawUploadErr } = await supabase.storage
          .from('clips')
          .upload(rawFilename, clipState.rawVideoBlob, { contentType: 'video/webm', upsert: true });
        if (rawUploadErr) throw rawUploadErr;
        const { data: rawUrlData } = supabase.storage.from('clips').getPublicUrl(rawFilename);
        rawClipUrl = rawUrlData.publicUrl;
      }

      // For articles, publish directly. For youtube/podcast, set to processing (worker will transcode).
      const status = clipState.sourceType === 'article' ? 'published' : 'processing';

      const { error: insertErr } = await supabase.from('annotations').insert({
        user_id: session.user.id,
        source_url: clipState.sourceUrl,
        source_type: clipState.sourceType,
        source_title: clipState.sourceTitle,
        source_author: clipState.sourceAuthor,
        source_thumbnail_url: clipState.sourceThumbnail,
        clip_start_seconds: clipState.clipStart,
        clip_end_seconds: clipState.clipEnd,
        clip_text: clipState.clipText,
        commentary_text: commentary.text,
        commentary_audio_url: commentaryAudioUrl,
        media_url: rawClipUrl,
        status,
        slug,
      });

      if (insertErr) throw insertErr;

      setPublishedSlug(slug);
      setStep('done');

      // Open landing page
      if (webAppUrl) {
        chrome.tabs.create({ url: `${webAppUrl}/a/${slug}` });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to publish');
      setStep('commentary');
    }
  };

  const reset = () => {
    setStep('capture');
    setClipState(null);
    setPublishedSlug(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-semibold">Annotated</h1>
        <button
          onClick={signOut}
          className="p-1.5 hover:bg-zinc-800 rounded-md transition"
          title="Sign out"
        >
          <LogOut className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {step === 'capture' && (
          <>
            {!pageContext ? (
              <div className="text-sm text-zinc-400">Detecting page...</div>
            ) : pageContext.sourceType === 'unknown' ? (
              <div className="text-sm text-zinc-400">
                <p className="mb-2">No clippable media detected on this page.</p>
                <p className="text-xs">Annotated supports YouTube videos, news articles, and podcasts.</p>
              </div>
            ) : (
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  {pageContext.sourceType} detected
                </div>

                {pageContext.sourceType === 'youtube' && (
                  <YouTubeClipper
                    title={pageContext.title}
                    thumbnail={pageContext.metadata.image}
                    onClipReady={handleClipReady}
                  />
                )}

                {pageContext.sourceType === 'article' && (
                  <ArticleHighlighter
                    title={pageContext.title}
                    author={pageContext.metadata.author}
                    onTextReady={handleTextReady}
                  />
                )}

                {pageContext.sourceType === 'podcast' && (
                  <PodcastClipper
                    title={pageContext.title}
                    audioSrc={pageContext.audioSrc}
                    onClipReady={handleClipReady}
                  />
                )}
              </div>
            )}
          </>
        )}

        {step === 'recording' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="relative flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500" />
            </div>
            <p className="text-sm text-zinc-400">Recording clip from page...</p>
            <p className="text-xs text-zinc-600">The video will play through your selected range.</p>
          </div>
        )}

        {step === 'commentary' && (
          <>
            {error && (
              <div className="mb-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <Commentary
              onReady={handlePublish}
              onBack={() => setStep('capture')}
            />
          </>
        )}

        {step === 'publishing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-zinc-400">Publishing your annotation...</p>
          </div>
        )}

        {step === 'done' && publishedSlug && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="text-2xl">✓</div>
            <p className="text-sm text-zinc-200 font-medium">Published!</p>
            {clipState?.sourceType !== 'article' && (
              <p className="text-xs text-zinc-500 text-center">
                Your clip is being processed. The landing page will update when it's ready.
              </p>
            )}
            {webAppUrl && (
              <button
                onClick={() => chrome.tabs.create({ url: `${webAppUrl}/a/${publishedSlug}` })}
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition"
              >
                <ExternalLink className="w-4 h-4" />
                View annotation
              </button>
            )}
            <button
              onClick={reset}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition"
            >
              Create another
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-2 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
        {session.user.email ?? session.user.user_metadata?.user_name ?? 'Signed in'}
      </div>
    </div>
  );
}
