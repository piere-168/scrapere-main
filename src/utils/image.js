export async function compressImage(file, maxDimension = 1920, quality = 0.85) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        throw new Error('File yang dipilih bukan gambar.');
    }

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
        reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Gagal memuat gambar.'));
        img.src = dataUrl;
    });

    let { width, height } = image;
    const longestSide = Math.max(width, height);
    if (longestSide > maxDimension) {
        const scale = maxDimension / longestSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Gagal membuat canvas untuk kompresi gambar.');
    }
    ctx.drawImage(image, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Marker = ';base64,';
    const markerIndex = compressedDataUrl.indexOf(base64Marker);
    if (markerIndex === -1) {
        throw new Error('Gagal mengambil data base64 hasil kompresi.');
    }
    return compressedDataUrl.slice(markerIndex + base64Marker.length);
}
