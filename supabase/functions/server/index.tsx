import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
const app = new Hono();

const ALLOWED_BUCKETS = new Set(["avatars", "event-banners"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-262ea102/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/make-server-262ea102/storage/:bucket", async (c) => {
  const bucket = c.req.param("bucket");
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return c.json({ error: "Bucket de upload inválido." }, 400);
  }

  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "Autenticação obrigatória." }, 401);
  }

  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return c.json({ error: "Sessão inválida ou expirada." }, 401);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: "Selecione uma imagem para enviar." }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return c.json({ error: "Formato inválido. Use PNG, JPEG ou WebP." }, 400);
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return c.json({ error: "A imagem deve ter no máximo 5 MB." }, 400);
  }

  const { data: existingBucket } = await supabase.storage.getBucket(bucket);
  if (!existingBucket) {
    const { error: bucketError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: MAX_IMAGE_SIZE,
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
    });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      console.error("Storage bucket setup failed:", bucketError.message);
      return c.json({ error: "Não foi possível preparar o armazenamento." }, 500);
    }
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError.message);
    return c.json({ error: "Não foi possível enviar a imagem." }, 500);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return c.json({ path, url: data.publicUrl }, 201);
});

Deno.serve(app.fetch);
