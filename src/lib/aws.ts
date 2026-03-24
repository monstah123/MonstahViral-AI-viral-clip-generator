import { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// AWS Configuration from environment variables
const region = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const bucketName = import.meta.env.VITE_AWS_BUCKET_NAME || '';

// Create S3 Client
export const s3Client = new S3Client({
  region: region,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Helper to upload a file (Blob/File/String) to S3 using multipart upload if large.
 * Returns the public URL of the uploaded file.
 */
export const uploadToS3 = async (
  filePath: string,
  body: Blob | File | Uint8Array | string,
  contentType: string
): Promise<string> => {
  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: filePath,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read', // We need public read so it acts like a public url
        CacheControl: 'max-age=3600',
      },
    });

    await upload.done();

    // Construct the public URL
    return `https://${bucketName}.s3.${region}.amazonaws.com/${filePath}`;
  } catch (error) {
    console.error('AWS S3 Upload Error:', error);
    throw error;
  }
};

/**
 * Helper to delete an item
 */
export const deleteFromS3 = async (key: string) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error('AWS S3 Delete Error:', error);
    throw error;
  }
};

/**
 * Helper to list items with a specific prefix
 */
export const listItemsFromS3 = async (prefix: string = '') => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 100,
    });
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('AWS S3 List Error:', error);
    throw error;
  }
};

/**
 * Helper to check if a file exists
 */
export const testS3File = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
};
