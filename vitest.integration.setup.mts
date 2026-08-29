import { config } from "dotenv";

// ローカルSupabaseスタックの接続情報（URL/anon key/service role key）を
// .envから読み込む。`supabase start`が起動していることが前提。
config({ path: ".env" });
