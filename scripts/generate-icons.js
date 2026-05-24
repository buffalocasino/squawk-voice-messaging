import sharp from 'sharp';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'static', 'icon.svg'); 

(async () => {
    try {
        // 1. Read the SVG file as a Buffer
        const svg = readFileSync(svgPath);

        // 2. Generate 192x192
        await sharp(svg).resize(192, 192).png().toFile(join(root, 'static', 'icon-192.png'));
        
        // 3. Generate 512x512
        await sharp(svg).resize(512, 512).png().toFile(join(root, 'static', 'icon-512.png'));

        console.log('Icons generated successfully: icon-192.png (192x192) and icon-512.png (512x512).');
        console.log('Task complete.');
    } catch (error) {
        console.error('Error generating icons:', error);
        process.exit(1);
    }
})();