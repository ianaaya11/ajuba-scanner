import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = () => Capacitor.isNativePlatform();

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * Takes a photo. On Android this opens the system camera through Capacitor.
 * Desktop has no equivalent one-tap capture, so it opens a file picker — point
 * a phone's camera at the page and drop the photo in, or pick an existing one.
 */
export async function capturePhoto(): Promise<Blob | null> {
  if (isNative()) {
    const photo = await Camera.getPhoto({
      quality: 92,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    return photo.dataUrl ? dataUrlToBlob(photo.dataUrl) : null;
  }
  return pickFiles(false).then((files) => files[0] ?? null);
}

/** Opens the gallery on Android, or a multi-select file dialog on desktop. */
export async function pickImages(): Promise<Blob[]> {
  if (isNative()) {
    const result = await Camera.pickImages({ quality: 92 });
    return Promise.all(
      result.photos.map(async (p) => (await fetch(p.webPath!)).blob()),
    );
  }
  return pickFiles(true);
}

function pickFiles(multiple: boolean): Promise<Blob[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    // A cancelled dialog fires no event on some browsers; resolve on blur too.
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Writes the finished PDF where the user can get at it: the Documents folder
 * plus a share sheet on Android, a normal download on desktop.
 */
export async function exportPdf(bytes: Uint8Array, filename: string): Promise<string> {
  if (isNative()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: bytesToBase64(bytes),
      directory: Directory.Documents,
      recursive: true,
    });
    await Share.share({ title: filename, url: uri, dialogTitle: 'Share PDF' });
    return `Saved to Documents/${filename}`;
  }

  const blob = new Blob([bytes as BufferSource], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `Downloaded ${filename}`;
}
