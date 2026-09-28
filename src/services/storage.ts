import { projectId } from "../../utils/supabase/info";

export type ImageBucket = "avatars" | "event-banners";

export interface UploadedImage {
  path: string;
  url: string;
}

const endpoint = `https://${projectId}.supabase.co/functions/v1/make-server-262ea102`;

export async function uploadImage(
  file: File,
  bucket: ImageBucket,
  accessToken: string,
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${endpoint}/storage/${bucket}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const result = (await response.json()) as UploadedImage & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? "Não foi possível enviar a imagem.");
  }

  return { path: result.path, url: result.url };
}
