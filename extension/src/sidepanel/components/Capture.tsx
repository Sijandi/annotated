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

type Step = 'capture' | 'commentary' | 'publishing' | 'done';

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

  const handleClipReady = async (data: { start: number; end: number; audioSrc?: string; videoBlob?: Blob }) => {
    if (!pageContext) return;

    if (pageContext.sourceType === 'youtube') {
      setClipState({
        sourceType: 'youtube',
        sourceUrl: pageContext.url,
        sourceTitle: pageContext.title,
        sourceAuthor: pageContext.metadata.author,
        sourceThumbnail: pageContext.metadata.image,
        clipStart: data.start,
        clipEnd: data.end,
        rawVideoBlob: data.videoBlob,
      });
      setStep('commentary');
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
    setError(null);

    const slug = generateSlug(clipState.sourceTitle);
    const rawVideoBlob = clipState.rawVideoBlob;

    setStep('publishing');

    try {
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

      // Upload raw video clip if captured
      let rawClipUrl: string | undefined;
      if (rawVideoBlob) {
        const rawFilename = `raw/${session.user.id}/${slug}.webm`;
        const { error: rawUploadErr } = await supabase.storage
          .from('clips')
          .upload(rawFilename, rawVideoBlob, { contentType: 'video/webm', upsert: true });
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
        media_url: rawClipUrl || clipState.audioSrc || null,
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
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                <p className="text-sm text-zinc-400">Detecting page...</p>
                <p className="text-xs text-zinc-600">Make sure you're on a YouTube video, article, or podcast page.</p>
              </div>
            ) : pageContext.sourceType === 'unknown' ? (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <div className="text-3xl mb-1">🔍</div>
                <p className="text-sm text-zinc-400">No clippable media detected.</p>
                <p className="text-xs text-zinc-600">Navigate to a YouTube video, news article, or podcast page to get started.</p>
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

        {step === 'commentary' && (
          <>
            {error && (
              <div className="mb-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <Commentary
              clipPreviewBlob={clipState?.rawVideoBlob}
              sourceType={clipState?.sourceType || ''}
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
