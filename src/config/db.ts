import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'freelance_platform',
  password: 'qwerty',
  port: parseInt(process.env.DB_PORT || '5432'),
});

export default pool; 