import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ppi from "../api/axios";

const getVideoKey = video => `${video.platform}:${video.platformVideoId}`;

const inputClass =
  "w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500";

const PlaylistVideoCard = ({ video, onRemove, removing }) => (
  <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg relative">
    {/* The Player only knows videos from the current search, so the details travel in the router state. */}
    <Link to={`/watch/${video.platform}/${video.platformVideoId}`} state={{ video }} className="block">
      <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-black/70 uppercase">{video.platform}</span>
      </div>
      <h3 className="text-lg font-bold text-white line-clamp-2">{video.title}</h3>
      <p className="text-sm text-white/60 truncate">{video.channelTitle}</p>
    </Link>
    <div className="absolute top-2 right-2 z-10">
      <button
        type="button"
        onClick={() => onRemove(video)}
        disabled={removing}
        className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-red-400 disabled:opacity-50"
        aria-label={`Remove ${video.title} from this playlist`}
        title="Remove from playlist"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
);

function PlaylistDetail() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPlaylist = async () => {
      setStatus("loading");

      try {
        const response = await ppi.get(`/api/v1/playlists/${playlistId}`);
        setPlaylist(response.data.data.playlist);
        setVideos(response.data.data.videos);
        setStatus("ready");
      } catch (requestError) {
        if (requestError.response?.status === 404) {
          setStatus("missing");
        } else {
          setError(requestError.response?.data?.message || "Could not load the playlist.");
          setStatus("ready");
        }
      }
    };

    fetchPlaylist();
  }, [playlistId]);

  const startEditing = () => {
    setDraft({ name: playlist.name, description: playlist.description || "" });
    setEditing(true);
  };

  const saveEdit = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await ppi.patch(`/api/v1/playlists/${playlistId}`, draft);
      setPlaylist(response.data.data);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save the changes.");
    } finally {
      setBusy(false);
    }
  };

  const deletePlaylist = async () => {
    if (!window.confirm(`Delete "${playlist.name}"? The videos stay on YouTube and Dailymotion.`)) return;

    setBusy(true);

    try {
      await ppi.delete(`/api/v1/playlists/${playlistId}`);
      navigate("/playlists");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete the playlist.");
      setBusy(false);
    }
  };

  const removeVideo = async video => {
    setBusy(true);
    setError("");

    try {
      await ppi.delete(`/api/v1/playlists/${playlistId}/videos/${encodeURIComponent(getVideoKey(video))}`);
      setVideos(current => current.filter(item => getVideoKey(item) !== getVideoKey(video)));
      setPlaylist(current => ({ ...current, itemCount: Math.max(0, (current.itemCount || 1) - 1) }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not remove the video.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen font-sans p-4 pt-24 sm:p-8 sm:pt-28">
      <Header />
      <main>
        <Link to="/playlists" className="text-sm text-purple-300 hover:text-white">
          ← My Playlists
        </Link>

        {status === "loading" && <p className="text-white/60 mt-6">Loading...</p>}

        {status === "missing" && <p className="text-white/60 mt-6">This playlist doesn&apos;t exist, or it isn&apos;t yours.</p>}

        {status === "ready" && playlist && (
          <>
            {editing ? (
              <form onSubmit={saveEdit} className="mt-6 mb-8 max-w-xl space-y-3">
                <input
                  type="text"
                  value={draft.name}
                  onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                  maxLength={100}
                  aria-label="Playlist name"
                  className={inputClass}
                />
                <textarea
                  value={draft.description}
                  onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                  maxLength={500}
                  rows={3}
                  placeholder="Description (optional)"
                  aria-label="Playlist description"
                  className={inputClass}
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={busy || !draft.name.trim()}
                    className="px-5 py-2 rounded-full font-semibold bg-gradient-to-r from-purple-500 to-pink-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="px-5 py-2 rounded-full bg-white/10 border border-white/20">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold break-words">{playlist.name}</h1>
                  {playlist.description && <p className="text-white/70 mt-2 whitespace-pre-line">{playlist.description}</p>}
                  <p className="text-sm text-white/50 mt-2">
                    Private · {playlist.itemCount} {playlist.itemCount === 1 ? "video" : "videos"}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button type="button" onClick={startEditing} className="px-5 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20">
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={deletePlaylist}
                    disabled={busy}
                    className="px-5 py-2 rounded-full bg-red-600/80 hover:bg-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 mb-6">{error}</p>}

            {videos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map(video => (
                  <PlaylistVideoCard key={getVideoKey(video)} video={video} onRemove={removeVideo} removing={busy} />
                ))}
              </div>
            ) : (
              <p className="text-white/60">No videos yet. Use Save on any video to add it here.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default PlaylistDetail;
