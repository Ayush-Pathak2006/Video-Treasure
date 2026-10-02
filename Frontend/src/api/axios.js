import axios from 'axios';

// Backend URL for the current mode: Frontend/.env.development (npm run dev)
// or Frontend/.env.production (npm run build, used by Vercel).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export default axiosInstance;
