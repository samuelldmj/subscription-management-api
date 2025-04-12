import { config } from 'dotenv';

const envPath = `.env.${process.env.NODE_ENV || 'development'}.local`;
//the config method loads the env file
config({ path: envPath });

// console.log(envPath);

// console.log('process.env after config:', {
//     PORT: process.env.PORT,
//     NODE_ENV: process.env.NODE_ENV,
//     DB_URI: process.env.DB_URI,
// });

export const
    {
        PORT,
        NODE_ENV,
        DB_URI,
        JWT_SECRET,
        JWT_EXPIRES_IN
    } = process.env;
















