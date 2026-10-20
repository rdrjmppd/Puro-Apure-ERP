/**
 * Utility: optimizeImageFile
 * Comprime y optimiza imágenes para almacenamiento canónico en Firestore (SSoT)
 * garantizando compatibilidad con cuotas de documentos (peso < 400KB) y máxima nitidez.
 */

export function optimizeImageFile(file: File, maxDimension: number = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = e.target?.result;
        if (typeof res === 'string') resolve(res);
        else reject(new Error('Error leyendo archivo SVG'));
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo SVG'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result;
      if (typeof rawDataUrl !== 'string') {
        reject(new Error('Error obteniendo datos de la imagen'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(width, 1);
          canvas.height = Math.max(height, 1);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Intentar PNG para preservar canal alfa si existe transparencia
          let outputDataUrl = canvas.toDataURL('image/png');

          // Si el PNG supera 350 KB, comprimir a JPEG optimizado al 90%
          if (outputDataUrl.length > 350 * 1024) {
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.90);
            if (jpegDataUrl.length < outputDataUrl.length) {
              outputDataUrl = jpegDataUrl;
            }
          }

          resolve(outputDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };

      img.onerror = () => {
        reject(new Error('El archivo seleccionado no pudo ser decodificado como imagen válida'));
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => reject(new Error('Ocurrió un error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}
