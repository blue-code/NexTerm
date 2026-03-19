/**
 * PNG 아이콘 생성 스크립트
 * Canvas API로 NexTerm 아이콘을 256x256 PNG로 렌더링한다.
 * electron-builder가 이 PNG를 .ico/.icns로 자동 변환한다.
 */
const fs = require('fs');
const path = require('path');

function generatePngWithoutCanvas() {
  // 256x256 32-bit RGBA PNG를 순수 Node.js로 생성
  const width = 256;
  const height = 256;
  const pixels = Buffer.alloc(width * height * 4);

  // 색상 정의
  const bg = [0x1a, 0x1b, 0x26, 0xff];
  const blue = [0x7a, 0xa2, 0xf7, 0xff];
  const green = [0x9e, 0xce, 0x6a, 0xff];
  const purple = [0xbb, 0x9a, 0xf7, 0xff];

  function setPixel(x, y, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  }

  function fillRect(x1, y1, w, h, color) {
    for (let y = y1; y < y1 + h && y < height; y++) {
      for (let x = x1; x < x1 + w && x < width; x++) {
        setPixel(x, y, color);
      }
    }
  }

  function fillRoundRect(x1, y1, w, h, r, color) {
    // 간소화된 라운드 렉트 (모서리를 원으로 근사)
    fillRect(x1 + r, y1, w - 2 * r, h, color);
    fillRect(x1, y1 + r, w, h - 2 * r, color);
    // 모서리 원
    for (let dy = 0; dy < r; dy++) {
      for (let dx = 0; dx < r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          setPixel(x1 + r - dx, y1 + r - dy, color);
          setPixel(x1 + w - r + dx - 1, y1 + r - dy, color);
          setPixel(x1 + r - dx, y1 + h - r + dy - 1, color);
          setPixel(x1 + w - r + dx - 1, y1 + h - r + dy - 1, color);
        }
      }
    }
  }

  // 배경 (라운드 렉트)
  fillRoundRect(0, 0, 256, 256, 48, bg);

  // 파란색 블록 (좌상)
  fillRoundRect(32, 32, 84, 84, 12, blue);

  // 초록색 블록 (우상)
  fillRoundRect(132, 32, 92, 84, 12, green);

  // 보라색 블록 (하단 전체)
  fillRoundRect(32, 132, 192, 92, 12, purple);

  return encodePng(width, height, pixels);
}

function encodePng(width, height, pixels) {
  const zlib = require('zlib');

  // PNG 시그니처
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR 청크
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 이미지 데이터 (필터 바이트 0 추가)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  // CRC32 계산
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return crc ^ 0xffffffff;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// 실행
const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
const png = generatePngWithoutCanvas();
fs.writeFileSync(outPath, png);
console.log('icon.png generated:', outPath, `(${png.length} bytes)`);
