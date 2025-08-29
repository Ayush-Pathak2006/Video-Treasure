import axios from 'axios';

const searchVideos = async (req, res) => {
    const { q: query, pageToken } = req.query; 

    if (!query) {
        return res.status(400).json({ error: "Search query is required" });
    }

    const YOUTUBE_SEARCH_API = `https://www.googleapis.com/youtube/v3/search`;
    const API_KEY = process.env.YOUTUBE_API_KEY;

    try {

        const params = {
            key: API_KEY,
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: 12,
        };


        if (pageToken) {
            params.pageToken = pageToken;
        }


        const response = await axios.get(YOUTUBE_SEARCH_API, { params });

        
        const videos = response.data.items.map(item => ({
            platformVideoId: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.high.url,
            platform: 'YouTube',
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
        }));

        res.status(200).json({
            message: "Videos fetched successfully",
            data: {videos,
            nextPageToken: response.data.nextPageToken
            }
        });

    } catch (error) {
        console.error("Error fetching from YouTube API:", error.message);
        res.status(500).json({ error: "Failed to fetch videos from YouTube" });
    }
};

export { searchVideos };