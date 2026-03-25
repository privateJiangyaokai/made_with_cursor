import { useCallback } from 'react';
import SparkMD5 from 'spark-md5';
import { useAuth } from '../context/AuthContext';
import { gqlRequest } from '../lib/gql';

type MediaFormat = 'JPEG' | 'JPG' | 'PNG' | 'GIF' | 'WEBP';

const getMediaFormat = (file: File): MediaFormat => {
  const ext = file.name.split('.').pop()?.toUpperCase();
  const typeMap: Record<string, MediaFormat> = {
    JPEG: 'JPEG', JPG: 'JPG', PNG: 'PNG', GIF: 'GIF', WEBP: 'WEBP',
  };
  return typeMap[ext ?? ''] ?? 'JPEG';
};

const computeMd5Base64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const spark = new SparkMD5.ArrayBuffer();
      spark.append(e.target?.result as ArrayBuffer);
      resolve(btoa(spark.end(true)));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

const GET_IMAGE_UPLOAD_URL = `
  mutation GetImageUploadUrl($md5: String!, $suffix: MediaFormat!, $acl: CannedAccessControlList) {
    imagePresignedUrl(imgMd5Base64: $md5, imageSuffix: $suffix, acl: $acl) {
      imageId
      uploadUrl
      uploadHeaders
    }
  }
`;

export const useImageUpload = () => {
  const { token } = useAuth();

  const uploadImage = useCallback(async (file: File): Promise<{ imageId: number }> => {
    const md5 = await computeMd5Base64(file);
    const suffix = getMediaFormat(file);

    const data = await gqlRequest<{
      imagePresignedUrl: { imageId: number; uploadUrl: string; uploadHeaders: unknown };
    }>(GET_IMAGE_UPLOAD_URL, { md5, suffix, acl: 'PUBLIC_READ' }, token);

    const { imageId, uploadUrl, uploadHeaders } = data.imagePresignedUrl;

    const headers: Record<string, string> = { 'Content-Type': file.type };
    if (uploadHeaders) {
      const parsed = typeof uploadHeaders === 'string' ? JSON.parse(uploadHeaders) : uploadHeaders;
      Object.assign(headers, parsed);
    }

    await fetch(uploadUrl, { method: 'PUT', body: file, headers });
    return { imageId };
  }, [token]);

  return { uploadImage };
};
