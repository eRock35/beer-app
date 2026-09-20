/**
 * Phone cameras produce 3–12 MB photos. Sending those raw would be slow, cost
 * more tokens than the answer is worth, and hit the request ceiling. Claude does
 * not need the extra pixels to judge colour, haze or a label, so shrink first.
 */
const MAX_EDGE = 1280;
const QUALITY = 0.82;

export function downscaleToDataUrl(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That is not an image.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Beer photos are often dim; keep the resampling as good as we can get.
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Always JPEG: a PNG of a photograph is several times larger for no gain.
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width, height });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };

    img.src = url;
  });
}

export const approxKb = (dataUrl) => Math.round((dataUrl.length * 3) / 4 / 1024);
