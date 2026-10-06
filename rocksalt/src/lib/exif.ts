import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Strips EXIF metadata from an image by redrawing it to a canvas
 * and uploads the cleaned image to Supabase Storage
 */
export async function stripExifAndUpload(
  file: File,
  supabase: SupabaseClient
): Promise<string> {
  // Load image
  const img = new Image()
  const url = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })

  // Redraw to canvas (strips EXIF)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(img, 0, 0)

  // Convert to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
      'image/jpeg',
      0.85
    )
  })

  URL.revokeObjectURL(url)

  // Upload to Supabase Storage
  const filename = `${crypto.randomUUID()}.jpg`
  const { data, error } = await supabase.storage
    .from('sighting-photos')
    .upload(filename, blob, {
      contentType: 'image/jpeg',
    })

  if (error) throw error

  // Demo mode stores the cleaned image inline and returns it as the path.
  return data?.path?.startsWith('data:') ? data.path : filename
}

