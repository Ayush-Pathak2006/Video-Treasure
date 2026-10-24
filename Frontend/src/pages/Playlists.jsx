import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ppi from "../api/axios";

const PlaylistCard = ({ playlist }) => (
  <Link
    to={`/playlists/${playlist._id}`}
    className="block bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg hover:-translate-y-1 transition-transform duration-300"
  >
    <div className="relative mb-4 aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/30 to-pink-600/30">
      {playlist.coverThumbnail && <img src={playlist.coverThumbnail} alt="" className="w-full h-full object-cover" />}
      <span className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded-full bg-black/70">
        {playlist.itemCount} {playlist.itemCount === 1 ? "video" : "videos"}
      </span>
    </div>
    <h3 className="text-lg font-bold text-white truncate">{playlist.name}</h3>
    <p className="text-sm text-white/60 line-clamp-2">{playlist.description || "Private playlist"}</p>
  </Link>
);

function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await ppi.get("/api/v1/playlists");
        setPlaylists(response.data.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Could not load your playlists.");
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylists();
  }, []);

  const handleCreate = async event => {
    event.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setError("");

    try {
      const response = await ppi.post("/api/v1/playlists", { name, description });
      setPlaylists(current => [response.data.data, ...current]);
      setName("");
      setDescription("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create the playlist.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen font-sans p-4 sm:p-8">
      <main>
        <h1 className="text-3xl font-bold mb-8">My Playlists</h1>

        <form
          onSubmit={handleCreate}
          className="mb-10 p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={100}
            placeholder="New playlist name"
            aria-label="New playlist name"
            className="flex-1 min-w-0 px-4 py-2 rounded-full bg-white/10 border border-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="text"
            value={description}
            onChange={event => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Description (optional)"
            aria-label="New playlist description"
            className="flex-1 min-w-0 px-4 py-2 rounded-full bg-white/10 border border-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-6 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 disabled:opacity-50"
          >
            Create
          </button>
        </form>

        {error && <p className="text-red-400 mb-6">{error}</p>}

        {loading ? (
          <p className="text-white/60">Loading...</p>
        ) : playlists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {playlists.map(playlist => (
              <PlaylistCard key={playlist._id} playlist={playlist} />
            ))}
          </div>
        ) : (
          <p className="text-white/60">No playlists yet. Create one above, or use Save on any video.</p>
        )}
      </main>
    </div>
  );
}

export default Playlists;
