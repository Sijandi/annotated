import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { LogOut, Loader2, ExternalLink, Globe, Lock, Link as LinkIcon, Check, FolderPlus } from 'lucide-react';
import { YouTubeClipper, type CropInfo } from './YouTubeClipper';
import { ArticleHighlighter } from './ArticleHighlighter';
import { PodcastClipper } from './PodcastClipper';
import { Commentary, type CommentaryData } from './Commentary';
import { CollectionPicker } from './CollectionPicker';
import { getTargetTab } from '../../lib/targetTab';
import { generateSlug } from '../../lib/slug';

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

// Mirrors PageMetadata in content-script.ts — stored as source_metadata jsonb
interface SourceMetadata {
  title?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  image?: string;
  favicon?: string;
  description?: string;
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
  crop?: CropInfo;
}

type Step = 'capture' | 'commentary' | 'publishing' | 'done';

// Best-effort page metadata fetch from the source tab. Resolves null (never
// rejects) if the tab is gone, the content script can't respond, or the page
// yielded nothing useful.
function getPageMetadata(tabId: number): Promise<SourceMetadata | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_METADATA' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null);
          return;
        }
        const metadata = response as SourceMetadata;
        resolve(Object.values(metadata).some(Boolean) ? metadata : null);
      });
    } catch {
      resolve(null);
    }
  });
}

type Visibility = 'public' | 'unlisted';

// chrome.storage.local key remembering the last-used publish visibility
const VISIBILITY_STORAGE_KEY = 'publishVisibility';

export function Capture({ session }: { session: Session }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [sourceTabId, setSourceTabId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('capture');
  const [clipState, setClipState] = useState<ClipState | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [linkCopied, setLinkCopied] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webAppUrl = import.meta.env.VITE_WEB_APP_URL || '';

  // Restore the last-used visibility choice
  useEffect(() => {
    chrome.storage.local.get(VISIBILITY_STORAGE_KEY, (result) => {
      const stored = result[VISIBILITY_STORAGE_KEY];
      if (stored === 'public' || stored === 'unlisted') setVisibility(stored);
    });
  }, []);

  const chooseVisibility = (v: Visibility) => {
    setVisibility(v);
    chrome.storage.local.set({ [VISIBILITY_STORAGE_KEY]: v });
  };

  useEffect(() => {
    getTargetTab()
      .then((tab) => {
        if (!tab.id) return;
        chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('content script not ready:', chrome.runtime.lastError.message);
            return;
          }
          setPageContext(response);
          setSourceTabId(tab.id ?? null);
        });
      })
      .catch((err) => console.warn('target tab lookup failed:', err.message));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const handleClipReady = async (data: { start: number; end: number; audioSrc?: string; videoBlob?: Blob; crop?: CropInfo }) => {
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
        crop: data.crop,
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

        // Sidecar crop metadata for the worker (tab capture records the whole
        // viewport; the worker crops to the player). Non-fatal if it fails —
        // the worker just skips cropping.
        if (clipState.crop) {
          const cropBlob = new Blob([JSON.stringify(clipState.crop)], { type: 'application/json' });
          const { error: cropUploadErr } = await supabase.storage
            .from('clips')
            .upload(`raw/${session.user.id}/${slug}.crop.json`, cropBlob, {
              contentType: 'application/json',
              upsert: true,
            });
          if (cropUploadErr) console.warn('[annotated] crop metadata upload failed:', cropUploadErr.message);
        }
      }

      // Articles publish directly. Podcasts and captured YouTube clips go to
      // processing (worker clips the audio / transcodes the raw recording).
      // YouTube without a captured blob keeps the legacy embed fallback.
      const status =
        clipState.sourceType === 'article' || (clipState.sourceType === 'youtube' && !rawVideoBlob)
          ? 'published'
          : 'processing';

      // Page metadata for source attribution — non-fatal if unavailable
      const sourceMetadata = sourceTabId != null ? await getPageMetadata(sourceTabId) : null;

      const { data: inserted, error: insertErr } = await supabase
        .from('annotations')
        .insert({
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
          source_metadata: sourceMetadata,
          status,
          visibility,
          slug,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      setPublishedSlug(slug);
      setPublishedId(inserted?.id ?? null);
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
    setPublishedId(null);
    setLinkCopied(false);
    setShowCollections(false);
    setError(null);
  };

  const copyPublishedLink = async () => {
    if (!webAppUrl || !publishedSlug) return;
    try {
      await navigator.clipboard.writeText(`${webAppUrl}/a/${publishedSlug}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard can fail if the panel loses focus — the URL is still visible to copy manually.
    }
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

            {/* Visibility picker — last choice persists across sessions */}
            <div className="mb-4 space-y-1.5">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Visibility</div>
              <div className="flex rounded-lg bg-zinc-900 p-1">
                <button
                  onClick={() => chooseVisibility('public')}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    visibility === 'public' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Public
                </button>
                <button
                  onClick={() => chooseVisibility('unlisted')}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    visibility === 'unlisted' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Unlisted
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                {visibility === 'public'
                  ? 'Shows in the public feed.'
                  : 'Only people with the link can view it.'}
              </p>
            </div>

            <Commentary
              visibility={visibility}
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
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="text-2xl">✓</div>
            <p className="text-sm text-zinc-200 font-medium">
              Published{visibility === 'unlisted' ? ' (unlisted)' : ''}!
            </p>
            {clipState?.sourceType !== 'article' && (
              <p className="text-xs text-zinc-500 text-center">
                Your clip is being processed. The landing page will update when it's ready.
              </p>
            )}

            {/* Share — one click to copy the landing link */}
            {webAppUrl && (
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2">
                  <span className="flex-1 text-xs text-zinc-400 truncate font-mono">
                    {`${webAppUrl}/a/${publishedSlug}`}
                  </span>
                </div>
                <button
                  onClick={copyPublishedLink}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4" />
                      Copy link
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Add to collection */}
            {publishedId && (
              <div className="w-full space-y-2">
                <button
                  onClick={() => setShowCollections((prev) => !prev)}
                  className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
                >
                  <FolderPlus className="w-4 h-4" />
                  Add to collection
                </button>
                {showCollections && (
                  <CollectionPicker session={session} annotationId={publishedId} />
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
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
