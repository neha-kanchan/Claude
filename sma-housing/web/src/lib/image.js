/* Student photos are downscaled in the browser before upload: a phone snapshot
   arrives as ~40-80 KB instead of several megabytes. Ported unchanged in spirit
   from the original client so both frontends store identical bodies. */
export const PHOTO_MAX_DIM = 480;
export const PHOTO_MAX_UPLOAD = 8 * 1024 * 1024;
const PHOTO_QUALITY = 0.85;

export function readImageFile(file, maxDim = PHOTO_MAX_DIM) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^image\//.test(file.type)) return reject(new Error('That file is not an image — choose a JPEG or PNG'));
    if (file.size > PHOTO_MAX_UPLOAD) return reject(new Error(`Image is larger than ${PHOTO_MAX_UPLOAD / 1048576} MB`));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // flatten transparency for JPEG
        ctx.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
        const base64 = data.slice(data.indexOf(',') + 1);
        resolve({
          name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
          mime: 'image/jpeg',
          size: Math.round((base64.length * 3) / 4),
          data
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Documents and case attachments are stored as-is, with a size ceiling. */
export const ATTACHMENT_MAX = 2 * 1024 * 1024;
export function readAnyFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > ATTACHMENT_MAX)
      return reject(new Error(`File is larger than ${ATTACHMENT_MAX / 1048576} MB`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => resolve({ name: file.name, mime: file.type, size: file.size, data: reader.result });
    reader.readAsDataURL(file);
  });
}
