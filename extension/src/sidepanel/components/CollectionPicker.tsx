import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { generateSlug } from '../../lib/slug';
import { Check, Link as LinkIcon, Loader2, Plus } from 'lucide-react';

interface Collection {
  id: string;
  title: string;
  slug: string;
  visibility: 'public' | 'unlisted';
}

interface Props {
  session: Session;
  annotationId: string;
}

// Postgres unique_violation — the annotation is already in the collection,
// which we treat as success.
const UNIQUE_VIOLATION = '23505';

// Lists the user's collections and adds `annotationId` to one on click.
// Also handles inline creation of a new collection (default unlisted) and
// copying the collection's landing link.
export function CollectionPicker({ session, annotationId }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline create form
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'unlisted'>('unlisted');
  const [saving, setSaving] = useState(false);

  const webAppUrl = import.meta.env.VITE_WEB_APP_URL || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cols }, { data: memberships }] = await Promise.all([
        supabase
          .from('collections')
          .select('id, title, slug, visibility')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('collection_items')
          .select('collection_id')
          .eq('annotation_id', annotationId),
      ]);
      if (cancelled) return;
      setCollections((cols as Collection[]) ?? []);
      setAddedTo(new Set((memberships ?? []).map((m) => m.collection_id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.user.id, annotationId]);

  const addToCollection = async (collectionId: string) => {
    if (addedTo.has(collectionId) || addingTo) return;
    setError(null);
    setAddingTo(collectionId);
    const { error: insertErr } = await supabase.from('collection_items').insert({
      collection_id: collectionId,
      annotation_id: annotationId,
    });
    setAddingTo(null);
    if (insertErr && insertErr.code !== UNIQUE_VIOLATION) {
      setError(insertErr.message || 'Failed to add to collection');
      return;
    }
    setAddedTo((prev) => new Set(prev).add(collectionId));
  };

  const copyCollectionLink = async (collection: Collection) => {
    if (!webAppUrl) return;
    try {
      await navigator.clipboard.writeText(`${webAppUrl}/c/${collection.slug}`);
      setCopiedId(collection.id);
      setTimeout(() => setCopiedId((prev) => (prev === collection.id ? null : prev)), 1500);
    } catch {
      setError('Could not copy link');
    }
  };

  const createCollection = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    setError(null);
    setSaving(true);
    const { data, error: createErr } = await supabase
      .from('collections')
      .insert({
        user_id: session.user.id,
        title,
        description: newDescription.trim() || null,
        visibility: newVisibility,
        slug: generateSlug(title),
      })
      .select('id, title, slug, visibility')
      .single();
    if (createErr || !data) {
      setSaving(false);
      setError(createErr?.message || 'Failed to create collection');
      return;
    }
    const created = data as Collection;
    setCollections((prev) => [created, ...prev]);
    // Add the annotation to the new collection right away — that's why the
    // user is creating it from here.
    await addToCollection(created.id);
    setSaving(false);
    setCreating(false);
    setNewTitle('');
    setNewDescription('');
    setNewVisibility('unlisted');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 rounded-md px-2 py-1.5">{error}</div>
      )}

      {collections.length === 0 && !creating && (
        <p className="text-xs text-zinc-500">No collections yet.</p>
      )}

      {collections.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-md bg-zinc-900 px-2 py-1.5">
          <button
            onClick={() => addToCollection(c.id)}
            disabled={addedTo.has(c.id) || addingTo === c.id}
            className="flex-1 flex items-center gap-2 min-w-0 text-left disabled:cursor-default"
          >
            {addedTo.has(c.id) ? (
              <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
            ) : addingTo === c.id ? (
              <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin shrink-0" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            )}
            <span className="text-xs text-zinc-200 truncate">{c.title}</span>
            {c.visibility === 'unlisted' && (
              <span className="text-[10px] text-zinc-600 shrink-0">unlisted</span>
            )}
          </button>
          {webAppUrl && (
            <button
              onClick={() => copyCollectionLink(c)}
              className="shrink-0 p-1 hover:bg-zinc-700 rounded transition"
              title="Copy collection link"
            >
              {copiedId === c.id ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <LinkIcon className="w-3 h-3 text-zinc-500" />
              )}
            </button>
          )}
        </div>
      ))}

      {creating ? (
        <div className="space-y-2 rounded-md bg-zinc-900 p-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Collection title"
            maxLength={120}
            autoFocus
            className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={500}
            rows={2}
            className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-600"
          />
          <div className="flex rounded-md bg-zinc-950 p-0.5">
            {(['unlisted', 'public'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setNewVisibility(v)}
                className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                  newVisibility === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {v === 'unlisted' ? 'Unlisted' : 'Public'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreating(false)}
              className="flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-400 transition"
            >
              Cancel
            </button>
            <button
              onClick={createCollection}
              disabled={!newTitle.trim() || saving}
              className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 px-2 py-1.5 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : 'Create & add'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
        >
          <Plus className="w-3 h-3" />
          New collection
        </button>
      )}
    </div>
  );
}
