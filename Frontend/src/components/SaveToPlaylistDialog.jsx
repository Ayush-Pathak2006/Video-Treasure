import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AppContext";
import ppi from "../api/axios";
import LoginPrompt from "./LoginPrompt";

const getVideoKey = video => `${video.platform}:${video.platformVideoId}`;

const primaryButtonClass =
  "inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 transition-colors disabled:opacity-50";

/**
 * Checkboxes for the user's playlists (checked = the video is in it) and an inline "New playlist" field. Each
 * change is saved right away. Rendered into document.body: the cards it opens from use CSS transforms, which
 * would trap a fixed overlay inside the card.
 */
function SaveToPlaylistDialog({ video, onClose, returnTo = null }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(Boolean(user));
  const [pendingId, setPendingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const videoKey = getVideoKey(video);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const [listResponse, containingResponse] = await Promise.all([
          ppi.get("/api/v1/playlists"),
          ppi.get(`/api/v1/playlists/containing/${encodeURIComponent(videoKey)}`),
        ]);
        if (cancelled) return;
        setPlaylists(listResponse.data.data);
        setSelectedIds(new Set(containingResponse.data.data.playlistIds.map(String)));
      } catch (requestError) {
        if (!cancelled) setError(requestError.response?.data?.message || "Could not load your playlists.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, videoKey]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const setSelected = (playlistId, isSelected) =>
    setSelectedIds(current => {
      const next = new Set(current);
      if (isSelected) next.add(playlistId);
      else next.delete(playlistId);
      return next;
    });

  const togglePlaylist = async playlistId => {
    const wasSelected = selectedIds.has(playlistId);
    setPendingId(playlistId);
    setError("");
    setSelected(playlistId, !wasSelected);

    try {
      if (wasSelected) {
        await ppi.delete(`/api/v1/playlists/${playlistId}/videos/${encodeURIComponent(videoKey)}`);
      } else {
        await ppi.post(`/api/v1/playlists/${playlistId}/videos`, video);
      }
    } catch (requestError) {
      setSelected(playlistId, wasSelected);
      setError(requestError.response?.data?.message || "Could not update the playlist.");
    } finally {
      setPendingId(null);
    }
  };

  const createPlaylist = async event => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setPendingId("new");
    setError("");

    try {
      const created = (await ppi.post("/api/v1/playlists", { name })).data.data;
      await ppi.post(`/api/v1/playlists/${created._id}/videos`, video);
      setPlaylists(current => [{ ...created, itemCount: 1 }, ...current]);
      setSelected(String(created._id), true);
      setNewName("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create the playlist.");
    } finally {
      setPendingId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to playlist"
        className="w-full max-w-md p-6 rounded-xl bg-gray-900/90 border border-white/10 shadow-2xl space-y-5 text-white"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Save to playlist</h2>
            <p className="text-sm text-white/60 truncate">{video.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        {!user ? (
          // Anonymous visitors see this instead of their (non-existent) playlists.
          <LoginPrompt message="Log in to save videos to your playlists." returnTo={returnTo} />
        ) : loading ? (
          <p className="text-white/60">Loading your playlists…</p>
        ) : (
          <>
            {playlists.length > 0 ? (
              <ul className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {playlists.map(playlist => {
                  const playlistId = String(playlist._id);
                  return (
                    <li key={playlistId}>
                      <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(playlistId)}
                          disabled={pendingId !== null}
                          onChange={() => togglePlaylist(playlistId)}
                          className="h-4 w-4 accent-purple-500"
                        />
                        <span className="flex-1 truncate">{playlist.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-white/60">You don&apos;t have any playlists yet.</p>
            )}

            <form onSubmit={createPlaylist} className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={event => setNewName(event.target.value)}
                maxLength={100}
                placeholder="New playlist"
                aria-label="New playlist name"
                className="flex-1 min-w-0 px-4 py-2 rounded-full bg-white/10 border border-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button type="submit" disabled={!newName.trim() || pendingId !== null} className={primaryButtonClass}>
                Create
              </button>
            </form>
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>,
    document.body
  );
}

// "Save" button that opens the dialog. Shown to everyone; anonymous visitors get the login prompt, which brings them
// back to `returnTo` (a path) after logging in when it's set.
export function SaveToPlaylistButton({ video, className = "", label = false, returnTo = null }) {
  const [open, setOpen] = useState(false);

  const handleClick = event => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={handleClick} className={className} aria-label="Save to playlist" title="Save to playlist">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {label && <span>Save</span>}
      </button>
      {open && <SaveToPlaylistDialog video={video} onClose={() => setOpen(false)} returnTo={returnTo} />}
    </>
  );
}

export default SaveToPlaylistDialog;
