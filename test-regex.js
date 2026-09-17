const regex = /(?:youtube\.com|youtu\.be)/;
const uri = 'https://www.youtube.com/watch?v=srM7Lc7alDI';
console.log('Regex matched?', regex.test(uri));
console.log('Image URL:', `https://img.youtube.com/vi/srM7Lc7alDI/hqdefault.jpg`);
