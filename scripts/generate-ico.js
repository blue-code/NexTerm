/**
 * PNG → ICO 변환 스크립트
 * 순수 Node.js로 PNG를 ICO 파일로 변환한다.
 * ICO 형식: 헤더 + 디렉토리 + PNG 데이터 임베드
 */
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

const pngData = fs.readFileSync(pngPath);

// PNG 헤더에서 크기 파싱
const width = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);

// ICO 파일 구조 생성
// ICO Header (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);       // Reserved
header.writeUInt16LE(1, 2);       // Type: 1 = ICO
header.writeUInt16LE(1, 4);       // Number of images

// ICO Directory Entry (16 bytes)
const entry = Buffer.alloc(16);
entry[0] = width >= 256 ? 0 : width;    // Width (0 = 256)
entry[1] = height >= 256 ? 0 : height;  // Height (0 = 256)
entry[2] = 0;                            // Color palette
entry[3] = 0;                            // Reserved
entry.writeUInt16LE(1, 4);               // Color planes
entry.writeUInt16LE(32, 6);              // Bits per pixel
entry.writeUInt32LE(pngData.length, 8);  // Image data size
entry.writeUInt32LE(22, 12);             // Offset to image data (6 + 16 = 22)

const ico = Buffer.concat([header, entry, pngData]);
fs.writeFileSync(icoPath, ico);

console.log(`icon.ico generated: ${icoPath} (${ico.length} bytes, ${width}x${height})`);
