import roomURL from '../../assets/shiba-rooms.jpg';
import interiorsURL from '../../assets/shiba-shop-interiors.jpg';
import { canvasMap } from './primitives.js';

// Each cell has its own bleed margin. Text is painted at the original chart resolution.
export const brands = [
  ['芝町マート', 'SHIBAMACHI MART', '#26705d', '#f1f2de'],
  ['炭火 やきとり', 'SUMIBI  •  YAKITORI', '#8f342a', '#f2dfab'],
  ['喫茶 山路', 'KISSA YAMAJI', '#34453e', '#e7d5b5'],
  ['御菓子 みなと', 'MINATO  /  WAGASHI', '#533f4a', '#e8d8be'],
  ['芝 大門書房', 'DAIMON BOOKS', '#344e64', '#ece5ce'],
  ['自家焙煎 珈琲', 'COFFEE ROASTERS', '#413b34', '#e5cfaa'],
  ['そば処 江戸路', 'EDOJI  /  SOBA', '#283c45', '#f4e7c8'],
  ['青山花舗', 'AOYAMA FLOWERS', '#49654f', '#e5e4d3'],
  ['パン工房 芝', 'SHIBA BAKERY', '#83503c', '#f3dfbf'],
  ['手打ち うどん', 'TEUCHI UDON', '#364851', '#eee5cb'],
  ['小野茶舗', 'ONO TEA', '#426050', '#dee2c6'],
  ['魚よし', 'UOYOSHI', '#365167', '#ebe3cd'],
  ['和紙 かえで', 'KAEDE PAPER', '#764b49', '#eee4d6'],
  ['青果 山本', 'YAMAMOTO', '#58764b', '#f2e9ca'],
  ['芝の洋食屋', 'SHIBA KITCHEN', '#7b4632', '#f1ddae'],
  ['眼鏡 井上', 'INOUE OPTICAL', '#394b59', '#e0e5df'],
];
const size = 384,
  cols = 8,
  rows = 8;
export const atlasGrid = [cols, rows];
export const cells = {
  glass: 0,
  sign: 16,
  blade: 32,
  closed: 48,
  ac: 49,
  guide: 50,
  bus: 51,
  manhole: 52,
  grille: 53,
  lobby: 54,
  lobbySign: 55,
};
// Road signs, shelters and fixtures use a second strip below the shop charts.
export async function makeShopAtlas() {
  const interiors = new Image(),
    room = new Image();
  room.src = roomURL;
  interiors.src = interiorsURL;
  await Promise.all([interiors.decode(), room.decode()]);
  return canvasMap(cols * size, rows * size, (ctx) => {
    function cell(i, paint) {
      ctx.save();
      ctx.translate((i % cols) * size, Math.floor(i / cols) * size);
      ctx.scale(size / 512, size / 512);
      ctx.beginPath();
      ctx.rect(0, 0, 512, 512);
      ctx.clip();
      paint(ctx);
      ctx.restore();
    }
    function rect(g, x, y, w, h, col) {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    }
    function text(g, s, x, y, font, color, align = 'center') {
      g.textAlign = align;
      g.fillStyle = color;
      g.font = font;
      g.fillText(s, x, y, 455);
    }
    brands.forEach(([name, en, ink, cream], i) => {
      cell(i, (g) => {
        const w = interiors.width / 2,
          h = interiors.height / 4;
        g.drawImage(
          interiors,
          (i % 2) * w + 2,
          Math.floor((i % 8) / 2) * h + 2,
          w - 4,
          h - 4,
          0,
          0,
          512,
          512,
        );
        const glass = g.createLinearGradient(0, 0, 160, 512);
        glass.addColorStop(0, 'rgba(142,173,179,.14)');
        glass.addColorStop(0.67, 'rgba(121,150,162,.035)');
        glass.addColorStop(1, 'rgba(26,37,41,.13)');
        g.fillStyle = glass;
        g.fillRect(0, 0, 512, 512);
      });
      cell(cells.sign + i, (g) => {
        rect(g, 0, 0, 512, 512, cream);
        rect(g, 0, 14, 512, 32, ink);
        rect(g, 0, 476, 512, 23, ink);
        if (i === 0) {
          rect(g, 0, 54, 512, 16, '#4997ab');
          rect(g, 0, 443, 512, 16, '#4997ab');
        }
        g.scale(1, 7.15);
        text(g, name, 256, 43, 'bold 38px serif', ink);
        text(g, en, 256, 58, 'bold 9px sans-serif', ink);
      });
      cell(cells.blade + i, (g) => {
        rect(g, 0, 0, 512, 512, ink);
        g.strokeStyle = cream;
        g.lineWidth = 8;
        g.strokeRect(28, 15, 456, 482);
        const chars = [
          '芝マート',
          '炭火串',
          '喫茶',
          '菓子舗',
          '書房',
          '珈琲',
          'そば',
          '花舗',
          'パン',
          'うどん',
          '茶舗',
          '魚よし',
          '和紙',
          '青果',
          '洋食',
          '眼鏡',
        ][i].split('');
        g.scale(3, 1);
        chars.forEach((c, k) =>
          text(
            g,
            c,
            85.3,
            65 + ((k + 0.72) * 390) / chars.length,
            (chars.length > 3 ? 'bold 83px' : 'bold 106px') + ' serif',
            cream,
          ),
        );
      });
    });
    cell(cells.lobby, (g) => {
      const w = room.width / 2,
        h = room.height / 2;
      g.drawImage(room, 2, 2, w - 4, h - 4, 0, 0, 512, 512);
    });
    cell(cells.lobbySign, (g) => {
      rect(g, 0, 0, 512, 512, '#393c39');
      g.scale(1, 6);
      text(g, 'エントランス', 256, 52, '500 40px sans-serif', '#cfc6ac');
    });
    cell(cells.closed, (g) => {
      rect(g, 0, 0, 512, 512, '#a7aaa5');
      for (let j = 8; j < 512; j += 13) {
        rect(g, 0, j, 512, 2, '#747b79');
        rect(g, 0, j + 3, 512, 2, '#c5c6bd');
      }
      rect(g, 240, 435, 35, 7, '#454e4f');
    });
    cell(cells.ac, (g) => {
      rect(g, 0, 0, 512, 512, '#b7bbb2');
      g.strokeStyle = '#696f6d';
      g.lineWidth = 5;
      for (let j = 18; j < 192; j += 12) {
        g.beginPath();
        g.arc(208, 253, j, 0, Math.PI * 2);
        g.stroke();
      }
      for (let k = 0; k < 15; k++) {
        const a = k * 0.419;
        g.beginPath();
        g.moveTo(208, 253);
        g.lineTo(208 + 190 * Math.cos(a), 253 + 190 * Math.sin(a));
        g.stroke();
      }
      for (let j = 0; j < 13; j++) rect(g, 424, 77 + 22 * j, 62, 5, '#878c86');
    });
    cell(cells.guide, (g) => {
      rect(g, 0, 0, 512, 512, '#e2dfc5');
      rect(g, 0, 0, 512, 88, '#355b4b');
      text(g, '芝公園 案内図', 256, 61, 'bold 44px sans-serif', '#f6f3df');
      rect(g, 35, 113, 442, 296, '#bed2af');
      g.strokeStyle = '#f0e4bd';
      g.lineWidth = 18;
      for (let j = 0; j < 5; j++) {
        g.beginPath();
        g.moveTo(50 + 41 * j, 112);
        g.lineTo(177 + 55 * j, 265);
        g.lineTo(98 + 74 * j, 406);
        g.stroke();
      }
      text(g, '● 現在地', 320, 306, 'bold 22px sans-serif', '#a44537');
      text(g, 'TOKYO METROPOLITAN PARK', 256, 462, '20px sans-serif', '#35574a');
    });
    cell(cells.bus, (g) => {
      const a = g.createLinearGradient(0, 0, 512, 512);
      a.addColorStop(0, '#314f50');
      a.addColorStop(1, '#c58860');
      g.fillStyle = a;
      g.fillRect(0, 0, 512, 512);
      rect(g, 0, 0, 512, 71, '#f2e6c5');
      text(g, '都営バス   BUS STOP', 256, 50, 'bold 32px sans-serif', '#38574b');
      g.fillStyle = '#efc379';
      g.beginPath();
      g.arc(355, 176, 89, 0, Math.PI * 2);
      g.fill();
      text(g, '東京散歩', 256, 331, 'bold 77px serif', '#f6edcc');
      text(g, 'SHIBA  /  MINATO', 256, 397, 'bold 25px sans-serif', '#f7e3b5');
    });
    cell(cells.manhole, (g) => {
      g.clearRect(0, 0, 512, 512);
      g.fillStyle = '#384146';
      g.beginPath();
      g.arc(256, 256, 250, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#88908a';
      g.lineWidth = 5;
      for (let j = 15; j < 256; j += 17) {
        g.beginPath();
        g.arc(256, 256, j, 0, Math.PI * 2);
        g.stroke();
      }
      text(g, '東京', 256, 275, 'bold 60px serif', '#99a098');
    });
    cell(cells.grille, (g) => {
      rect(g, 0, 0, 512, 512, '#5c6464');
      for (let j = 0; j < 10; j++) rect(g, 22, j * 50 + 8, 468, 24, '#222d30');
    });
  });
}
