// FICTITIOUS sample letters for demo purposes only. No real personal data.
import saman from '../samples/saman-pdrm.txt?raw';
import lhdn from '../samples/lhdn-notis.txt?raw';
import tnb from '../samples/tnb-bil.txt?raw';

export interface Sample { id: string; label: { ms: string; en: string }; text: string; image: string }

export const SAMPLES: Sample[] = [
  { id: 'saman', label: { ms: 'Saman trafik', en: 'Traffic summons' }, text: saman, image: './samples/saman-pdrm.jpg' },
  { id: 'lhdn', label: { ms: 'Notis LHDN', en: 'LHDN tax notice' }, text: lhdn, image: './samples/lhdn-notis.jpg' },
  { id: 'tnb', label: { ms: 'Bil TNB tertunggak', en: 'TNB overdue bill' }, text: tnb, image: './samples/tnb-bil.jpg' },
];
