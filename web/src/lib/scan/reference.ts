// Локальный справочник типичных продуктов — опора для оценки сахара, чтобы цифры не «плавали».
// Значения — добавленный (свободный) сахар на 100 г/мл, усреднённо по типичным товарам в магазинах.
// Порядок важен: первое совпадение побеждает (частные случаи выше общих).

export type RefSwap = {
  /** название замены; {amount} подставится объём/вес исходной позиции, если он известен */
  n: string;
  /** сахар замены на 100 г/мл */
  per100: number;
  /** цена замены относительно исходной позиции */
  priceK: number;
};

export type RefEntry = {
  key: string;
  /** человекочитаемое название категории (подсказка модели) */
  label: string;
  match: RegExp;
  /** исключения: если совпало — категория не подходит */
  not?: RegExp;
  /** добавленный сахар, г на 100 г/мл */
  per100: number;
  /** типичный вес/объём одной штуки, г или мл — если в названии не указан */
  typical: number;
  junk: 0 | 1;
  swap?: RefSwap;
};

// В JS \b и \w понимают только латиницу — делаем их юникодными (кириллица, казахские буквы).
const UB = '(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))';
const uni = (re: RegExp): RegExp =>
  new RegExp(re.source.replaceAll('\\b', UB).replaceAll('\\w', '[\\p{L}\\p{N}_]'), re.flags.includes('u') ? re.flags : re.flags + 'u');

const WATER: RefSwap = { n: 'Вода минеральная{amount}', per100: 0, priceK: 0.5 };

const RAW: RefEntry[] = [
  // ── напитки ──
  { key: 'energy', label: 'энергетик', match: /(энерг|energy|red\s*bull|ред\s*булл|adrenaline|адреналин|flash|флеш|gorilla|горилла|burn|берн|monster)/i, not: /(без\s*сахара|zero|sugar\s*free)/i, per100: 11, typical: 450, junk: 1, swap: WATER },
  { key: 'soda', label: 'сладкая газировка, лимонад', match: /(\bкола|кока|cola|coca|пепси|pepsi|спрайт|sprite|фанта|fanta|миринда|mirinda|7\s*up|лимонад|газ\.?\s*нап|газированн|газдалған|тархун|дюшес|буратино|schweppes|швепс)/i, not: /(zero|зеро|без\s*сахара|лайт|light|sugar\s*free|минерал|\bвода\b)/i, per100: 10.6, typical: 1000, junk: 1, swap: { n: 'Минералка с лимоном{amount}', per100: 0, priceK: 0.45 } },
  { key: 'ice-tea', label: 'холодный чай в бутылке', match: /(холодн\w*\s*чай|ice\s*tea|айс\s*ти|fuze|фьюз|lipton|липтон|нести|nestea)/i, not: /(без\s*сахара|zero)/i, per100: 7.5, typical: 500, junk: 1, swap: { n: 'Чай зелёный без сахара{amount}', per100: 0, priceK: 0.7 } },
  { key: 'juice', label: 'сок, нектар, морс (свободный сахар)', match: /(\bсок\b|нектар|шырын|морс|компот|juice|rich|рич|j7|джей\s*севен|da\s*juice|gracio|грацио|piko|пико)/i, not: /(без\s*сахара)/i, per100: 10, typical: 1000, junk: 1, swap: { n: 'Яблоки{amount}', per100: 0, priceK: 0.8 } },
  { key: 'milkshake', label: 'молочный коктейль, какао, сладкое молоко', match: /(коктейл|какао|шоколадн\w*\s*молок|молоко\s*шоколад|несквик|nesquik|чудо|кофе\s*3\s*в\s*1|3в1|капучино\s*в\s*бут|латте\s*в\s*бут)/i, per100: 9, typical: 300, junk: 1, swap: { n: 'Молоко 2,5%{amount}', per100: 0, priceK: 0.7 } },
  { key: 'kvass', label: 'квас', match: /(квас)/i, per100: 5, typical: 1000, junk: 0 },

  // ── молочные десерты ──
  { key: 'glazed-curd', label: 'сырок глазированный', match: /(сырок|глаз\w*\s*сыр|глазир)/i, per100: 26, typical: 45, junk: 1, swap: { n: 'Творог 5%{amount}', per100: 0, priceK: 0.9 } },
  { key: 'sweet-yogurt', label: 'сладкий/фруктовый йогурт, творожок, десерт', match: /(йогурт|йог\b|йог\.|творожок|растишк|даниссимо|danissimo|активиа|activia|чудо|десерт|пудинг|fruttis|фруттис|агуша|ehrmann|эрман)/i, not: /(натурал|греческ|без\s*сахара|без\s*добав)/i, per100: 11, typical: 270, junk: 0, swap: { n: 'Кефир 1%{amount}', per100: 0, priceK: 0.85 } },
  { key: 'ice-cream', label: 'мороженое', match: /(морожен|пломбир|эскимо|балмұздақ|рожок|магнат|magnum\s*морож|ice\s*cream)/i, per100: 21, typical: 80, junk: 1, swap: { n: 'Замороженные ягоды{amount}', per100: 0, priceK: 1 } },
  { key: 'condensed', label: 'сгущёнка', match: /(сгущ|сгущён|варён\w*\s*сгущ|ірімшік\s*сүт)/i, per100: 44, typical: 380, junk: 1 },

  // ── сладости ──
  { key: 'dark-choc', label: 'горький шоколад 70–90%', match: /(шокол\w*.*(7\d|8\d|9\d)\s*%|горьк\w*\s*шокол|тёмн\w*\s*шокол|темн\w*\s*шокол)/i, per100: 20, typical: 100, junk: 0 },
  { key: 'chocolate', label: 'шоколад, шоколадный батончик', match: /(шокол|chocolate|snickers|сникерс|марс\b|mars\b|twix|твикс|баунти|bounty|kit\s*kat|кит\s*кат|nuts|натс|alpen\s*gold|альпен|милка|milka|казахстан\w*\s*шок|рахат|баян\s*сулу|киндер|kinder)/i, per100: 50, typical: 90, junk: 1, swap: { n: 'Орехи и сухофрукты{amount}', per100: 0, priceK: 1 } },
  { key: 'candy', label: 'конфеты, мармелад, зефир, халва', match: /(конфет|лукум|карамел|мармелад|зефир|пастил|халва|леденц|ирис|драже|skittles|скитлс|m&m|жевательн\w*\s*конф|чупа|chupa|тянучк|кәмпит)/i, per100: 60, typical: 200, junk: 1, swap: { n: 'Сухофрукты{amount}', per100: 0, priceK: 1 } },
  { key: 'jam-honey', label: 'варенье, джем, мёд, сироп', match: /(варен|джем|конфитюр|повидл|мёд|\bмед\b|\bбал\b|сироп|топпинг|нутелла|nutella|паста\s*шокол)/i, per100: 55, typical: 300, junk: 1 },
  { key: 'sugar', label: 'сахар', match: /(сахар\b|сахар\s|сахар-песок|рафинад|қант)/i, not: /(без\s*сахара|в\s*сахаре)/i, per100: 100, typical: 1000, junk: 0 },

  // ── выпечка и сухие завтраки ──
  { key: 'cake', label: 'торт, пирожное, рулет, кекс, маффин', match: /(торт|пирожн|рулет|кекс|маффин|muffin|капкейк|чизкейк|эклер|медовик|наполеон|бисквит|трубочк)/i, per100: 30, typical: 1000, junk: 1, swap: { n: 'Фрукты{amount}', per100: 0, priceK: 0.85 } },
  { key: 'cookies', label: 'печенье, вафли, пряники, крекер сладкий', match: /(печен|вафл|пряник|юбилейн|орео|oreo|choco\s*pie|чокопай|бискв|савоярди|сушк|баранк|галет|tuc|крекер)/i, per100: 24, typical: 200, junk: 1, swap: { n: 'Хлебцы цельнозерновые{amount}', per100: 1, priceK: 0.9 } },
  { key: 'pastry', label: 'сладкая выпечка: булочка, круассан, пончик, слойка', match: /(булоч|круассан|croissant|пончик|донат|donut|слойк|ватрушк|синнабон|пирож\w*\s*сладк|баурсак|бауырсақ)/i, per100: 12, typical: 100, junk: 1, swap: { n: 'Хлеб ржаной', per100: 2, priceK: 0.6 } },
  { key: 'cereal', label: 'сладкие хлопья, подушечки, гранола, мюсли', match: /(хлопья\s*(шокол|медов|сладк)|подушечк|nesquik\s*хлоп|гранол|мюсли|кукуруз\w*\s*хлоп|завтрак\s*сух|kellogg|келлогг|fitness\s*хлоп)/i, per100: 22, typical: 300, junk: 1, swap: { n: 'Овсяные хлопья{amount}', per100: 0, priceK: 0.6 } },
  { key: 'bread', label: 'хлеб, батон', match: /(хлеб|\bбатон\b|нан\b|лаваш|багет|тандыр)/i, per100: 3, typical: 400, junk: 0 },

  // ── соусы и снеки ──
  { key: 'ketchup', label: 'кетчуп, сладкие соусы', match: /(кетчуп|ketchup|барбекю|bbq|соус\s*(сладк|чили|терияки|кисло))/i, per100: 22, typical: 350, junk: 0 },
  { key: 'chips', label: 'чипсы, снеки, сухарики', match: /(чипс|lays|лейс|pringles|принглс|сухарик|кириешк|снек|начос|попкорн\s*(сладк|карам))/i, per100: 1.5, typical: 150, junk: 1, swap: { n: 'Попкорн без сахара{amount}', per100: 0, priceK: 0.6 } },

  // ── ноль сахара (проверяются последними, чтобы «лимонад» не стал «лимоном») ──
  { key: 'water', label: 'вода, минералка без сахара', match: /\b(вода|су\b|минерал|aqua|bonaqua|бонаква|асем|tassay|тассай|архыз|borjomi|боржоми)/i, not: /(сладк|лимонад|газ\.?\s*нап|со вкус)/i, per100: 0, typical: 1000, junk: 0 },
  { key: 'tea-coffee', label: 'чай/кофе без сахара (сухой)', match: /\b(чай|шай|кофе|кофе зерн|молот)/i, not: /(холодн|ice|айс|fuze|фьюз|lipton.*(л|ml|мл)|3\s*в\s*1|3в1|напит)/i, per100: 0, typical: 100, junk: 0 },
  { key: 'plain-dairy', label: 'молоко, кефир, айран, творог, сметана, натуральный йогурт', match: /\b(молоко|мол\b|мол\.|сүт|кефир|айран|тан|шұбат|кумыс|қымыз|творог|сметана|ряженка|сливки|натурал|греческ|простоквош)/i, not: /(сгущ|шокол|коктейл|фрукт|клубн|ванил|глаз|сырок|десерт|творожок|какао)/i, per100: 0, typical: 1000, junk: 0 },
  { key: 'staple', label: 'мясо, рыба, яйца, крупы, овощи, фрукты, масло, сыр', match: /\b(мясо|говяд|баран|конин|курин|куриц|филе|фарш|рыба|лосос|яйц|жұмыртқа|крупа|гречк|\bрис\b|овсян|макарон|мука|картоф|морков|\bлук\b|огур|помид|томат|капуст|яблок|банан|апельсин|мандарин|груш|лимон|\bсыр\b|масло|орех|миндал|фундук)/i, not: /(глаз|шокол|сырок|в сахаре|сироп|джем|варен|слойк|пирог|пирож|чипс)/i, per100: 0, typical: 1000, junk: 0 },
];

export const REFERENCE: RefEntry[] = RAW.map(r => ({ ...r, match: uni(r.match), not: r.not && uni(r.not) }));

/** Найти категорию по названию позиции (сокращения кассы тоже). */
export function findReference(name: string): RefEntry | null {
  const s = name.replace(/ё/gi, 'е');
  for (const r of REFERENCE) {
    if (r.match.test(s) && !(r.not && r.not.test(s))) return r;
  }
  return null;
}

/**
 * Вес или объём из названия, в граммах/мл на одну штуку.
 * «Кола 1Л» → 1000, «Сок 0,5 л» → 500, «Йогурт 270г» → 270, «Вода 6х0,5л» → 3000, «МОЛ ПРОСТ 3,2 1Л» → 1000.
 */
export function amountFromName(name: string): number | null {
  const s = name.toLowerCase().replace(/ё/g, 'е');
  const unit = (u: string) => (/^(кг|kg|л|l|литр)/.test(u) ? 1000 : 1);
  const num = (v: string) => parseFloat(v.replace(',', '.'));

  const multi = s.match(/(\d+)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)\s*(кг|kg|г|гр|g|мл|ml|л|l)(?![a-zа-я])/);
  if (multi) return Math.round(num(multi[1]) * num(multi[2]) * unit(multi[3]));

  const one = s.match(/(\d+(?:[.,]\d+)?)\s*(кг|kg|гр|г|g|мл|ml|литр\w*|л|l)(?![a-zа-я])/);
  if (one) {
    const v = num(one[1]) * unit(one[2]);
    return v > 0 && v <= 20000 ? Math.round(v) : null;
  }
  return null;
}

/** Подставить объём в название замены: «Минералка{amount}» + 1000 → «Минералка, 1 л». */
export function swapName(tpl: string, amount: number | null): string {
  if (!amount) return tpl.replace('{amount}', '');
  const txt = amount >= 1000
    ? `${String(+(amount / 1000).toFixed(1)).replace('.', ',')} ${/вода|минерал|чай|молоко|кефир/i.test(tpl) ? 'л' : 'кг'}`
    : `${amount} ${/вода|минерал|чай|молоко|кефир/i.test(tpl) ? 'мл' : 'г'}`;
  return tpl.replace('{amount}', `, ${txt}`);
}
