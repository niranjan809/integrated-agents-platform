import { createClient } from "@libsql/client";
import { config } from "../config.js";

export const db = createClient({
  url: config.dbUrl,
  authToken: config.dbAuthToken,
});
