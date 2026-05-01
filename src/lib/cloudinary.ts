// Cloudinary upload utility for VEP
// Uses unsigned upload preset for client-side uploads

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dgigch2p2';
const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY || '548624826664783';

// Using unsigned upload preset (create one in Cloudinary dashboard)
// This allows client-side uploads without exposing API secret
const UPLOAD_PRESET = 'vep_unsigned'; // You'll need to create this in Cloudinary

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: 'image' | 'video' | 'raw';
  width?: number;
  height?: number;
  duration?: number;
  bytes: number;
  original_filename: string;
}

export async function uploadToCloudinary(
  file: File,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
): Promise<CloudinaryUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('api_key', API_KEY);
  
  // Auto-detect resource type if not specified
  const detectedType = resourceType === 'auto' 
    ? file.type.startsWith('image/') ? 'image' 
      : file.type.startsWith('video/') ? 'video' 
      : 'raw'
    : resourceType;

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${detectedType}/upload`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary upload failed: ${error}`);
  }

  const result = await response.json();
  
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    format: result.format,
    resource_type: result.resource_type,
    width: result.width,
    height: result.height,
    duration: result.duration,
    bytes: result.bytes,
    original_filename: result.original_filename,
  };
}

// Generate optimized image URL with transformations
export function getOptimizedImageUrl(
  publicId: string,
  options: { width?: number; height?: number; quality?: number; format?: string } = {}
): string {
  const { width = 800, quality = 80, format = 'auto' } = options;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_${width},q_${quality},f_${format}/${publicId}`;
}

// Generate thumbnail URL
export function getThumbnailUrl(publicId: string, width: number = 300): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_${width},h_${width},c_fill,q_auto,f_auto/${publicId}`;
}

// Check if file is previewable image
export function isPreviewableImage(fileType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'].includes(fileType);
}

// Check if file is previewable video
export function isPreviewableVideo(fileType: string): boolean {
  return ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'].includes(fileType);
}
