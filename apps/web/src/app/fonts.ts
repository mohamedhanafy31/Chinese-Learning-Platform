import {
  Alexandria,
  Aref_Ruqaa,
  Ma_Shan_Zheng,
  Noto_Sans_SC,
} from 'next/font/google';

/** Arabic + Latin interface face (designed by Egyptian type designer Mohamed Gaber). */
export const alexandria = Alexandria({
  subsets: ['arabic', 'latin'],
  weight: 'variable',
  variable: '--font-alexandria',
  display: 'swap',
});

/** Arabic display: Ruqʿah calligraphy, the brush hand that answers the Chinese one. */
export const arefRuqaa = Aref_Ruqaa({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-ruqaa',
  display: 'swap',
});

/** Chinese display: brush kaishu. */
export const maShanZheng = Ma_Shan_Zheng({
  weight: '400',
  variable: '--font-mashan',
  display: 'swap',
  preload: false,
});

/** Chinese interface face. */
export const notoSansSc = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
  preload: false,
});

export const fontVariables = [
  alexandria.variable,
  arefRuqaa.variable,
  maShanZheng.variable,
  notoSansSc.variable,
].join(' ');
