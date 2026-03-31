import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'https://video-treasure-backend.onrender.com',
  withCredentials: true,
});

export default axiosInstance;