import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from './app.js';
import { startNicheCrawler } from "./services/nicheCrawler.service.js";


dotenv.config({
    path: './.env'
});


connectDB()
.then(() => {
    app.listen(process.env.PORT || 8000, () => {
        console.log(`✅ Server is running at port : ${process.env.PORT}`);
        startNicheCrawler(); 
    });
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
});