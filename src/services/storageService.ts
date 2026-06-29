import { supabase } from '../db';
import { randomUUID } from 'crypto';

/**
 * Uploads a generated PDF buffer to the Supabase Storage 'worksheets' bucket
 * and returns the public access URL.
 */
export async function uploadPdfBuffer(buffer: Buffer, filenamePrefix: string): Promise<string> {
  const cleanPrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanPrefix}_${randomUUID()}.pdf`;

  // Upload the binary buffer
  const { data, error } = await supabase.storage
    .from('worksheets')
    .upload(filename, buffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(`Failed to upload PDF to Supabase Storage: ${error.message}`);
  }

  // Get the public download URL
  const { data: publicUrlData } = supabase.storage
    .from('worksheets')
    .getPublicUrl(filename);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error(`Failed to retrieve public URL for uploaded worksheet: ${filename}`);
  }

  return publicUrlData.publicUrl;
}
