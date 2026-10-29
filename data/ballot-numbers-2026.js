// 115 年地方選舉候選人號次：雲林縣、臺北市與高雄市抽籤結果。
// Keep ballot numbers separate from candidate overrides so manually edited photos and links retain priority.
const ballotOrder = names => Object.freeze(Object.fromEntries(names.map((name, index) => [name, index + 1])));
const ballotNameKey = name => String(name ?? '').normalize('NFKC').replace(/[·‧．・]/g, '.').replace(/\s+/g, '').toLowerCase();
globalThis.FOBallotNumberForName = (numbers, name) => {
  if (!numbers || !name) return undefined;
  if (Object.prototype.hasOwnProperty.call(numbers, name)) return numbers[name];
  const matches = Object.entries(numbers).filter(([listedName]) => ballotNameKey(listedName) === ballotNameKey(name));
  return matches.length === 1 ? matches[0][1] : undefined;
};
globalThis.FOBallotNumbers = Object.freeze({
  '10009': Object.freeze({
    election: '縣長',
    source: '雲林縣選舉委員會',
    date: '2026-10-27',
    numbers: Object.freeze({ '吳炳輝': 1, '張嘉郡': 2, '劉建國': 3, '林佳瑜': 4 }),
    // 議員號次依選舉區重新起算；第 4 區鍾任明未列入正式抽籤名冊，不指定號次。
    councilors: Object.freeze({
      '1': Object.freeze({ '黃勝志': 1, '曾博鴻': 2, '陳永修': 3, '黃釋瑩': 4, '邱世文': 5, '鍾明馨': 6, '楊朝祈': 7, '賴瑪玲': 8, '林岳璋': 9, '陳芳盈': 10, '張光儀': 11, '林靖冠': 12, '王竣毅': 13, '林群力': 14, '廖郁賢': 15, '江文登': 16, '廖昶淳': 17, '許百芳': 18 }),
      '2': Object.freeze({ '陳麗蘭': 1, '吳延豐': 2, '高明達': 3, '林森寳': 4, '賴明源': 5, '黃景鴻': 6, '張庭綺': 7, '洪惠玲': 8, '王秋足': 9 }),
      '3': Object.freeze({ '黃美瑤': 1, '蔡明水': 2, '陳俊龍': 3, '李明明': 4, '魏順興': 5, '張維心': 6, '沈昱霆': 7, '王鈺齊': 8, '陳乙辰': 9, '黃凱': 10, '林文彬': 11 }),
      '4': Object.freeze({ '楊智凱': 1, '王裔迪': 2, '李明哲': 3, '廖子漢': 4, '廖庭輝': 5, '游淑雲': 6, '李泓儀': 7, '張家閎': 8, '廖偉晴': 9, '洪如萍': 10 }),
      '5': Object.freeze({ '趙育祥': 1, '蘇國誼': 2, '蔡永順': 3, '郭佩瑄': 4, '許留賓': 5, '蔡梨美': 6, '吳蕙蘭': 7, '吳宗典': 8, '林宜豊': 9, '林建鴻': 10 }),
      '6': Object.freeze({ '蔡岳儒': 1, '王承宏': 2, '黃美蘭': 3, '蔡孟真': 4, '陳定鈞': 5, '王新堯': 6, '黃文祥': 7 }),
      // 抽籤表將呂佶娜另附族語姓名；網站候選人名單目前以中文姓名索引。
      '7': Object.freeze({ '周志祥Kacaw．Kaco': 1, '呂佶娜': 2, '鄭玫惠': 3 }),
      '8': Object.freeze({ '張忠豪': 1, '蔡嘉峻PisawHakaw': 2, '李丘威達': 3, '高瑛翠': 4 }),
    }),
  }),
  '63000': Object.freeze({
    election: '市長、市議員、里長',
    source: '臺北市選舉委員會候選人登記冊（有號次）',
    date: '2026-10-27',
    numbers: ballotOrder(['郭璽', '林志成', '沈伯洋', '蕭文乾', '蔣萬安', '唐新民']),
    // 第 6 區游智彬未列在此抽籤名冊，保留既有候選人資料但不指定號次。
    councilors: Object.freeze({
      '1': ballotOrder(['汪志冰', '林杏兒', '陳怡潔', '陳慈慧', '林世宗', '紀建漢', '劉致妤', '賴苡任', '謝閔弘', '陳彥廷', '侯漢廷', '陳重文', '鍾佩玲', '張斯綱', '李文', '黃瀞瑩', '林聖峰', '林揚庭', '林延鳳', '陳賢蔚']),
      '2': ballotOrder(['闕枚莎', '游淑慧', '陳冠安', '陳又新', '王孝維', '何恕懷', '吳世正', '高嘉瑜', '李明賢', '陳宥丞', '何孟樺', '黃啟彬', '吳欣岱']),
      '3': ballotOrder(['許淑華', '詹為元', '秦慧珠', '左曉明', '洪健益', '許甫', '許原榮', '戴錫欽', '鄧樂強', '張文潔', '郭凡', '李明璇', '林柏勛']),
      '4': ballotOrder(['柳采葳', '黃麗香', '李易儒', '陳炳甫', '林亮君', '李惠暄', '朱政騏', '林珍羽', '林子揚', '顏若芳', '熊羿', '陳怡君', '賴俊翰', '葉林傳']),
      '5': ballotOrder(['張延廷', '吳志剛', '陳力新', '吳怡萱', '徐立信', '馬郁雯', '鍾小平', '郭昭巖', '譚傳紹', '張銘祐', '王振庭', '洪婉臻', '劉耀仁', '應佳妤']),
      '6': ballotOrder(['曾獻瑩', '王閔生', '耿葳', '李柏毅', '王欣儀', '張維學', '陳聖文', '陳錦祥', '陳峙穎', '簡舒培', '李道翔', '楊植斗', '張志豪', '李奇峯', '苗博雅', '徐弘庭', '鍾沛君', '劉品妡']),
      '7': ballotOrder(['林筱薇 Icyang Tamana', '李芳儒']),
      '8': ballotOrder(['孔垂崢 Haisul Islituan', '林家豪', '李傅鈺婷']),
    }),
  }),
  '64000': Object.freeze({
    election: '市長、市議員',
    source: '高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表',
    numbers: ballotOrder(['張靜', '王肇民', '柯志恩', '洪方隆', '賴瑞隆']),
    councilors: Object.freeze({
      '1': ballotOrder(['李振豪', '林義迪', '林慧欣', '鍾炳光', '林富寶']),
      '2': ballotOrder(['李柏融', '李亞築', '黃明太', '陳琳潔', '鄭東元']),
      '3': ballotOrder(['方信淵', '張騏晟', '宋立彬', '蔣黃女', '黃秋媖', '林志誠', '黃韻涵', '蔡秉璁']),
      '4': ballotOrder(['黃文志', '李雅芬', '白喬茵', '柳淑芳', '李眉蓁', '李雅慧', '陳玫娟', '張以理', '陳冠宇', '陳麗珍', '薛兆基', '尹立']),
      '5': ballotOrder(['黃飛鳳', '陳惠君', '張勝富', '江瑞鴻', '邱俊憲', '陳若翠', '吳利成']),
      '6': ballotOrder(['簡煥宗', '李喬如', '蔡金晏', '陳美雅']),
      '7': ballotOrder(['何權峰', '童燕珍', '林彥', '黃香菽', '曾俊傑', '張博洋', '林于凱', '康裕成', '鄭孟洳', '黃柏霖', '余聖明', '黃淑美']),
      '8': ballotOrder(['黃舜杰', '黃裕庭', '許采蓁', '湯詠瑜', '黃文益', '黃鈺婷', '陳雅敏', '鄒約翰', '郭建盟']),
      '9': ballotOrder(['林智鴻', '張漢忠', '鄭安秝', '蘇致榮', '陳慧文', '劉德林', '李雅靜', '徐尚賢', '鍾易仲', '鄧巧佩']),
      '10': ballotOrder(['李政憲', '湯茹婷', '劉仙娥', '蔡武宏', '張藝璉', '于仙玲', '鄭光峰', '陳麗娜', '李順進', '李紘毅', '吳銘賜', '吳昱鋒', '黃敬雅']),
      '11': ballotOrder(['洪村銘', '黃天煌', '邱于軒', '王耀裕', '李雨庭', '張耀中']),
      '12': ballotOrder(['巫振興', '宋紹銘', '王義雄']),
      '13': ballotOrder(['陳幸富', '葛姵瑩']),
      '14': ballotOrder(['洪英雄Salizan．binkinuan', '林錫閔', '高忠德Takiludun．Anu']),
      '15': ballotOrder(['金禾雅', '陳奕蓁']),
    }),
  }),
});
