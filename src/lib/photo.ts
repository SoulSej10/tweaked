import { supabase } from './supabase'

/** Shrink a phone photo to at most `max` px on the long side and re-encode as JPEG. */
export async function shrinkImage(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo'))), 'image/jpeg', quality),
  )
}

/** Upload to the private dish-photos bucket under <user id>/<recipe id>/. Returns the storage path. */
export async function uploadDishPhoto(file: File, recipeId: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('Not signed in')
  const blob = await shrinkImage(file)
  const path = `${uid}/${recipeId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('dish-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
}

/** Short-lived signed URLs for private photos, keyed by path. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from('dish-photos').createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  return out
}
