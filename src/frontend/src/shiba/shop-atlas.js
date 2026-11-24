import { canvasMap, random } from './primitives.js';

// Each cell has its own bleed margin. Text is painted at the original chart resolution.
export const brands = [
  ['芝町マート', 'SHIBAMACHI MART', '#26705d', '#f1f2de'],
  ['炭火 やきとり', 'SUMIBI  •  YAKITORI', '#8f342a', '#f2dfab'],
  ['喫茶 山路', 'KISSA YAMAJI', '#34453e', '#e7d5b5'],
  ['御菓子 みなと', 'MINATO  /  WAGASHI', '#533f4a', '#e8d8be'],
  ['芝 大門書房', 'DAIMON BOOKS', '#344e64', '#ece5ce'],
  ['自家焙煎 珈琲', 'COFFEE ROASTERS', '#413b34', '#e5cfaa'],
  ['そば処 江戸路', 'EDOJI  /  SOBA', '#283c45', '#f4e7c8'],
];
const size = 384,
  cols = 4,
  rows = 6;
export const atlasGrid = [cols, rows];
export const cells = { glass: 0, sign: 7, blade: 14, closed: 21, ac: 22, guide: 23 };
// Road signs, shelters and fixtures use a second strip below the shop charts.
export function makeShopAtlas() {
  return canvasMap(cols * size, (rows + 1) * size, (ctx) => {
    const rng = random(72904);
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
      g.fillText(s, x, y);
    }
    brands.forEach(([name, en, ink, cream], i) => {
      cell(i, (g) => {
        rect(g, 0, 0, 512, 512, '#343e3e');
        const interior = g.createLinearGradient(0, 25, 0, 496);
        interior.addColorStop(0, '#374342');
        interior.addColorStop(0.25, i % 2 ? '#bea37b' : '#b3b4a4');
        interior.addColorStop(0.8, '#81765f');
        interior.addColorStop(1, '#464944');
        g.fillStyle = interior;
        g.fillRect(8, 9, 496, 492);
        // Receding ceiling, rear shelving and pendant lights behind the street glazing.
        g.fillStyle = '#b7ab90';
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(512, 0);
        g.lineTo(418, 111);
        g.lineTo(92, 111);
        g.closePath();
        g.fill();
        for (let k = 0; k < 5; k++) {
          let x = 44 + k * 104;
          g.strokeStyle = '#77786d';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(100 + x * 0.61, 111);
          g.stroke();
        }
        if (i === 0 || i === 3 || i === 4) {
          for (let shelf = 0; shelf < 4; shelf++)
            for (let c = 0; c < 25; c++) {
              let x = 12 + c * 20 + (shelf % 2) * 2,
                y = 160 + shelf * 57,
                hh = 16 + rng() * 22;
              const pkg = ['#a64d36', '#e3be77', '#6b8e79', '#b7b4a1', '#c4d2ca', '#586e77', '#d29e62'][
                Math.floor(rng() * 7)
              ];
              rect(g, x, y - hh, 9 + rng() * 8, hh, pkg);
              rect(g, x, y - hh * 0.6, 10, 4, '#e6d5ae');
              rect(g, 9, y + 1, 493, 6, '#514e43');
              rect(g, 9, y + 7, 493, 3, '#c7b89e');
            }
        } else {
          for (let k = 0; k < 4; k++) {
            const x = 42 + 122 * k;
            rect(g, x, 83, 3, 44, '#4a453b');
            g.fillStyle = '#dcc29a';
            g.beginPath();
            g.moveTo(x - 16, 142);
            g.lineTo(x - 7, 128);
            g.lineTo(x + 8, 128);
            g.lineTo(x + 18, 142);
            g.fill();
            rect(g, x - 14, 142, 28, 4, '#fff0c4');
            rect(g, x - 45, 309, 98, 8, '#665343');
            rect(g, x + 1, 317, 5, 78, '#595145');
            for (let j of [-23, 24]) {
              rect(g, x + j - 10, 330, 26, 7, '#8f735a');
              rect(g, x + j, 337, 4, 55, '#53463c');
              rect(g, x + j + 9, 303, 4, 30, '#5b4e42');
            }
          }
          for (let k = 0; k < 3; k++) {
            rect(g, 43 + k * 145, 173, 81, 81, '#675a49');
            rect(g, 47 + k * 145, 177, 73, 73, k % 2 ? '#bbae8e' : '#c6b192');
            text(g, ['本日', '手仕事', '芝'][k], 84 + k * 145, 222, '24px serif', '#665441');
          }
        }
        const reflection = g.createLinearGradient(0, 0, 512, 148);
        reflection.addColorStop(0, '#bdd6df44');
        reflection.addColorStop(0.48, '#accbce12');
        reflection.addColorStop(0.54, '#d2e5e435');
        reflection.addColorStop(1, '#6e858629');
        g.fillStyle = reflection;
        g.fillRect(9, 9, 494, 487);
        for (const x of [7, 174, 340, 500]) {
          rect(g, x, 0, 7, 512, '#3a4444');
          rect(g, x + 5, 0, 2, 512, '#adb0a5');
        }
        rect(g, 0, 89, 512, 6, '#56605d');
        rect(g, 0, 457, 512, 6, '#455050');
        rect(g, 316, 257, 5, 56, '#d3d0bb');
        rect(g, 198, 179, 66, 82, '#e4d5af');
        text(g, i % 2 ? '営業中' : '入口', 231, 229, 'bold 18px sans-serif', ink);
      });
      cell(7 + i, (g) => {
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
      cell(14 + i, (g) => {
        rect(g, 0, 0, 512, 512, ink);
        g.strokeStyle = cream;
        g.lineWidth = 8;
        g.strokeRect(28, 15, 456, 482);
        const chars = ['芝マート', '炭火串', '喫茶', '菓子舗', '書房', '珈琲', 'そば'][i].split('');
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
    cell(24, (g) => {
      rect(g, 0, 0, 512, 512, '#245d94');
      g.strokeStyle = '#e0e8db';
      g.lineWidth = 6;
      g.strokeRect(8, 12, 496, 488);
      [
        ['↑  東京タワー', 'Tokyo Tower'],
        ['←  芝公園', 'Shiba Park'],
        ['→  大門', 'Daimon'],
      ].forEach(([jp, en], i) => {
        text(g, jp, 31, 100 + i * 151, 'bold 61px sans-serif', '#f1f4e9', 'left');
        text(g, en, 112, 145 + i * 151, '29px sans-serif', '#e1e8e4', 'left');
      });
    });
    cell(25, (g) => {
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
    cell(26, (g) => {
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
    cell(27, (g) => {
      rect(g, 0, 0, 512, 512, '#5c6464');
      for (let j = 0; j < 10; j++) rect(g, 22, j * 50 + 8, 468, 24, '#222d30');
    });
  });
}
