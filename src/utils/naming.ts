import characters from '../data/characters.json';
import middleChars from '../data/middleChars.json';
import endingChars from '../data/endingChars.json';
import auspiciousPhrases from '../data/auspiciousPhrases.json';
import { namingDB, resetNamingDB } from './db';

export interface Character {
  char: string;
  pinyin: string;
  tone: number;
  wuxing: string;
  simplified_strokes: number;
  traditional_strokes: number;
  auspicious_phrases: string[];
  type?: 'passThrough' | 'ending' | 'auspicious'; // 字类型
}

export interface NameResult {
  fullName: string;
  firstName: string;
  secondName: string;
  firstChar: Character;
  secondChar: Character;
  tones: number[];
  tonePattern: string;
  wuxing: string[];
  auspiciousReferences: string[];
  nameStructure: string; // 名字结构说明
}

export interface NamingOptions {
  surname: string;
  preferredWuxing: string[]; // 喜欢的五行（可多选）
  tonePattern?: string; // 平仄偏好
  tonePatternDesc?: string; // 平仄描述
}

// 获取所有五行字符
const getAllWuxingCharacters = (): Character[] => {
  return characters as Character[];
};

// 获取中间位置常用字（通关字+中性字）
const getMiddleCharacters = (): Character[] => {
  return middleChars as Character[];
};

// 获取结尾位置吉祥字
const getEndingCharacters = (): Character[] => {
  return endingChars as Character[];
};

// 根据五行筛选字符（排除中性字）- 保留供未来使用
// const filterByWuxing = (wuxing: string[]): Character[] => {
//   if (!wuxing || wuxing.length === 0) {
//     return getAllWuxingCharacters();
//   }
//   return getAllWuxingCharacters().filter(char =>
//     wuxing.includes(char.wuxing) && char.wuxing !== '中性'
//   );
// };

// 获取指定五行的字符
const getCharsByWuxing = (wuxing: string): Character[] => {
  return getAllWuxingCharacters().filter(char => char.wuxing === wuxing);
};

// 判断声调类型（平声：1、2声；仄声：3、4声）
export const getToneType = (tone: number): 'ping' | 'ze' => {
  return tone <= 2 ? 'ping' : 'ze';
};

// 检查平仄模式
const checkTonePattern = (
  char1: Character,
  char2: Character,
  pattern: string
): boolean => {
  if (!pattern || pattern === 'any') {
    return true;
  }

  const type1 = getToneType(char1.tone);
  const type2 = getToneType(char2.tone);
  const currentPattern = type1 + type2;

  return currentPattern === pattern;
};

/**
 * 核心起名算法
 * 规则：
 * 1. 如果选择了多个五行（如金+木），则两字分别使用不同五行
 * 2. 如果只选择了一个五行（如金），则：
 *    - 方案A：通关字 + 五行字（如"可金"）
 *    - 方案B：五行字 + 吉祥结尾字（如"金然"）
 *    - 方案C：五行字放在中间，吉祥字结尾（如"金之"）
 * 3. **重要**：每个字在同一个位置最多使用MAX_REUSE次（由用户设置，默认2次）
 */

// 声明全局变量类型
declare global {
  interface Window {
    __MAX_REUSE__?: number;
  }
}

// 获取最大重复次数（从全局变量或默认值）
const getMaxReuse = (): number => {
  return typeof window !== 'undefined' && window.__MAX_REUSE__ ? window.__MAX_REUSE__ : 2;
};

export const generateNames = async (
  options: NamingOptions,
  count: number = 32
): Promise<NameResult[]> => {
  const MAX_REUSE = getMaxReuse();
  
  console.log(`\n=== 开始生成名字 ===`);
  console.log(`最大重复次数设置: ${MAX_REUSE}`);
  console.log(`选择的五行: ${options.preferredWuxing?.join(', ') || '无'}`);
  
  // 重置数据库，确保从干净状态开始
  await resetNamingDB();
  await namingDB.init();
  
  console.log(`[初始化] 数据库已重置，所有字符计数清零\n`);
  
  const { surname, preferredWuxing, tonePattern = 'any', tonePatternDesc } = options;
  let results: NameResult[] = [];
  const used = new Set<string>();

  // 情况1：选择了多个五行
  if (preferredWuxing && preferredWuxing.length >= 2) {
    results = await generateMultiWuxingNames(
      surname,
      preferredWuxing,
      tonePattern,
      tonePatternDesc,
      count,
      used,
      MAX_REUSE
    );
    
    return sortNamesByQuality(results);
  }

  // 情况2：只选择了一个五行
  if (preferredWuxing && preferredWuxing.length === 1) {
    results = await generateSingleWuxingWithPassThroughNames(
      surname,
      preferredWuxing[0],
      tonePattern,
      tonePatternDesc,
      count,
      used,
      MAX_REUSE
    );
    
    return sortNamesByQuality(results);
  }

  // 情况3：没有选择五行（不限）
  results = await generateUnrestrictedNames(
    surname,
    tonePattern,
    tonePatternDesc,
    count,
    used,
    MAX_REUSE
  );
  
  console.log(`\n=== 生成完成 ===`);
  console.log(`最终结果数量: ${results.length}\n`);
  
  return sortNamesByQuality(results);
};

/**
 * 多五行模式：两字使用不同五行
 */
const generateMultiWuxingNames = async (
  surname: string,
  wuxingList: string[],
  tonePattern: string,
  tonePatternDesc: string | undefined,
  count: number,
  used: Set<string>,
  MAX_REUSE: number
): Promise<NameResult[]> => {
  const results: NameResult[] = [];
  let skipCount1 = 0;  // 跳过中间字的次数
  let skipCount2 = 0;  // 跳过结尾字的次数
  
  console.log(`[多五行] 开始生成，目标数量: ${count}`);
  
  // 遍历所有五行组合
  for (let i = 0; i < wuxingList.length; i++) {
    for (let j = 0; j < wuxingList.length; j++) {
      if (i === j) continue; // 跳过相同五行

      const wuxing1 = wuxingList[i];
      const wuxing2 = wuxingList[j];

      const chars1 = getCharsByWuxing(wuxing1);
      const chars2 = getCharsByWuxing(wuxing2);

      console.log(`[多五行] 处理组合: ${wuxing1}+${wuxing2}, 字符数: ${chars1.length} x ${chars2.length}`);

      // 组合两个字
      for (let k = 0; k < chars1.length; k++) {
        const char1 = chars1[k];

        for (let l = 0; l < chars2.length; l++) {
          const char2 = chars2[l];
          if (char1.char === char2.char) continue;

          // 【关键修复】每条组合都重新查询最新计数
          const char1Count = await namingDB.getCharCount(char1.char, 'first');
          if (char1Count >= MAX_REUSE) {
            skipCount1++;
            break;  // 中间字达到限制，跳出内层循环
          }
          
          const char2Count = await namingDB.getCharCount(char2.char, 'second');
          if (char2Count >= MAX_REUSE) {
            skipCount2++;
            continue;  // 尾部字达到限制，跳过
          }

          const nameKey = char1.char + char2.char;
          if (used.has(nameKey)) continue;

          // 检查平仄
          if (!checkTonePattern(char1, char2, tonePattern)) continue;

          // 检查平仄描述
          if (tonePatternDesc) {
            const descTones = parseToneDescription(tonePatternDesc);
            if (descTones && !matchToneDescription([char1.tone, char2.tone], descTones)) {
              continue;
            }
          }

          used.add(nameKey);
          
          // 更新数据库中的计数
          await namingDB.incrementMultipleChars([
            { char: char1.char, position: 'first' },
            { char: char2.char, position: 'second' }
          ]);

          const auspiciousRefs = collectAuspiciousPhrases(char1, char2);

          results.push({
            fullName: surname + char1.char + char2.char,
            firstName: char1.char,
            secondName: char2.char,
            firstChar: char1,
            secondChar: char2,
            tones: [char1.tone, char2.tone],
            tonePattern: getToneType(char1.tone) + getToneType(char2.tone),
            wuxing: [char1.wuxing, char2.wuxing],
            auspiciousReferences: auspiciousRefs,
            nameStructure: `${wuxing1}+${wuxing2}`
          });

          if (results.length >= count) {
            console.log(`[多五行] 已达到目标数量 ${count}，返回结果`);
            return results;
          }
        }
      }
    }
  }

  console.log(`[多五行] 生成结束，共生成 ${results.length} 个名字`);
  console.log(`[多五行] 跳过统计 - 中间字: ${skipCount1}次, 结尾字: ${skipCount2}次`);
  
  return results;
};

/**
 * 单五行+通关字模式
 */
const generateSingleWuxingWithPassThroughNames = async (
  surname: string,
  targetWuxing: string,
  tonePattern: string,
  tonePatternDesc: string | undefined,
  count: number,
  used: Set<string>,
  MAX_REUSE: number
): Promise<NameResult[]> => {
  const results: NameResult[] = [];
  let skipCountA1 = 0;  // 方案A跳过中间字
  let skipCountA2 = 0;  // 方案A跳过结尾字
  let skipCountB1 = 0;  // 方案B跳过中间字
  let skipCountB2 = 0;  // 方案B跳过结尾字
  
  console.log(`[单五行-${targetWuxing}] 开始生成，目标数量: ${count}`);
  
  const wuxingChars = getCharsByWuxing(targetWuxing);
  const middleChars = getMiddleCharacters();
  const endingChars = getEndingCharacters();

  console.log(`[单五行] 字符库大小 - 中间字: ${middleChars.length}, 五行字(${targetWuxing}): ${wuxingChars.length}, 结尾字: ${endingChars.length}`);

  // 方案A：中间字 + 五行字（尾部）
  for (let i = 0; i < middleChars.length; i++) {
    const midChar = middleChars[i];
    
    for (let j = 0; j < wuxingChars.length; j++) {
      const wxChar = wuxingChars[j];
      if (midChar.char === wxChar.char) continue;
      
      // 【关键修复】每条组合都重新查询最新计数，不复用旧数据
      const midCount = await namingDB.getCharCount(midChar.char, 'first');
      if (midCount >= MAX_REUSE) {
        skipCountA1++;
        break;  // 中间字达到限制，跳出内层循环，换下一个中间字
      }
      
      const wxCount = await namingDB.getCharCount(wxChar.char, 'second');
      if (wxCount >= MAX_REUSE) {
        skipCountA2++;
        continue;  // 尾部字达到限制，跳过这个尾部字
      }

      const nameKey = midChar.char + wxChar.char;
      if (used.has(nameKey)) continue;

      if (!checkTonePattern(midChar, wxChar, tonePattern)) continue;

      if (tonePatternDesc) {
        const descTones = parseToneDescription(tonePatternDesc);
        if (descTones && !matchToneDescription([midChar.tone, wxChar.tone], descTones)) {
          continue;
        }
      }

      used.add(nameKey);
      
      // 更新数据库中的计数
      await namingDB.incrementMultipleChars([
        { char: midChar.char, position: 'first' },
        { char: wxChar.char, position: 'second' }
      ]);
      
      // 重新读取最新计数用于日志
      const newMidCount = await namingDB.getCharCount(midChar.char, 'first');
      const newWxCount = await namingDB.getCharCount(wxChar.char, 'second');
      console.log(`[方案A-生成名字] "${midChar.char}${wxChar.char}" | "${midChar.char}"新计数="${newMidCount}", "${wxChar.char}"新计数="${newWxCount}"`);

      const auspiciousRefs = collectAuspiciousPhrases(midChar, wxChar);

      results.push({
        fullName: surname + midChar.char + wxChar.char,
        firstName: midChar.char,
        secondName: wxChar.char,
        firstChar: midChar,
        secondChar: wxChar,
        tones: [midChar.tone, wxChar.tone],
        tonePattern: getToneType(midChar.tone) + getToneType(wxChar.tone),
        wuxing: [midChar.wuxing || '中性', wxChar.wuxing],
        auspiciousReferences: auspiciousRefs,
        nameStructure: `中间(${midChar.type || '常用'})+${targetWuxing}`
      });

      if (results.length >= count) {
        return results;
      }
    }
  }

  // 方案B：五行字 + 吉祥结尾字
  for (let i = 0; i < wuxingChars.length; i++) {
    const wxChar = wuxingChars[i];

    for (let j = 0; j < endingChars.length; j++) {
      const endChar = endingChars[j];
      if (wxChar.char === endChar.char) continue;
      
      // 【关键修复】每条组合都重新查询最新计数
      const wxCount = await namingDB.getCharCount(wxChar.char, 'first');
      if (wxCount >= MAX_REUSE) {
        skipCountB1++;
        break;  // 中间字达到限制，跳出内层循环
      }
      
      const endCount = await namingDB.getCharCount(endChar.char, 'second');
      if (endCount >= MAX_REUSE) {
        skipCountB2++;
        continue;  // 尾部字达到限制，跳过
      }

      const nameKey = wxChar.char + endChar.char;
      if (used.has(nameKey)) continue;

      if (!checkTonePattern(wxChar, endChar, tonePattern)) continue;

      if (tonePatternDesc) {
        const descTones = parseToneDescription(tonePatternDesc);
        if (descTones && !matchToneDescription([wxChar.tone, endChar.tone], descTones)) {
          continue;
        }
      }

      used.add(nameKey);
      
      // 更新数据库中的计数
      await namingDB.incrementMultipleChars([
        { char: wxChar.char, position: 'first' },
        { char: endChar.char, position: 'second' }
      ]);

      const auspiciousRefs = collectAuspiciousPhrases(wxChar, endChar);

      results.push({
        fullName: surname + wxChar.char + endChar.char,
        firstName: wxChar.char,
        secondName: endChar.char,
        firstChar: wxChar,
        secondChar: endChar,
        tones: [wxChar.tone, endChar.tone],
        tonePattern: getToneType(wxChar.tone) + getToneType(endChar.tone),
        wuxing: [wxChar.wuxing, endChar.wuxing || '中性'],
        auspiciousReferences: auspiciousRefs,
        nameStructure: `${targetWuxing}+结尾(${endChar.type || '吉祥'})`
      });

      if (results.length >= count) {
        return results;
      }
    }
  }

  // 方案C：五行字 + 五行字（同五行，作为备选）
  if (results.length < count) {
    for (let i = 0; i < wuxingChars.length; i++) {
      const char1 = wuxingChars[i];

      for (let j = 0; j < wuxingChars.length; j++) {
        if (i === j) continue;

        const char2 = wuxingChars[j];
        
        // 【关键修复】每条组合都重新查询最新计数
        const char1Count = await namingDB.getCharCount(char1.char, 'first');
        if (char1Count >= MAX_REUSE) {
          break;  // 中间字达到限制，跳出内层循环
        }
        
        const char2Count = await namingDB.getCharCount(char2.char, 'second');
        if (char2Count >= MAX_REUSE) {
          continue;  // 尾部字达到限制，跳过
        }

        const nameKey = char1.char + char2.char;
        if (used.has(nameKey)) continue;

        if (!checkTonePattern(char1, char2, tonePattern)) continue;

        if (tonePatternDesc) {
          const descTones = parseToneDescription(tonePatternDesc);
          if (descTones && !matchToneDescription([char1.tone, char2.tone], descTones)) {
            continue;
          }
        }

        used.add(nameKey);
        
        // 更新数据库中的计数
        await namingDB.incrementMultipleChars([
          { char: char1.char, position: 'first' },
          { char: char2.char, position: 'second' }
        ]);

        const auspiciousRefs = collectAuspiciousPhrases(char1, char2);

        results.push({
          fullName: surname + char1.char + char2.char,
          firstName: char1.char,
          secondName: char2.char,
          firstChar: char1,
          secondChar: char2,
          tones: [char1.tone, char2.tone],
          tonePattern: getToneType(char1.tone) + getToneType(char2.tone),
          wuxing: [char1.wuxing, char2.wuxing],
          auspiciousReferences: auspiciousRefs,
          nameStructure: `${targetWuxing}+${targetWuxing}(同五行)`
        });

        if (results.length >= count) {
          return results;
        }
      }
    }
  }

  console.log(`[单五行-${targetWuxing}] 生成结束，共生成 ${results.length} 个名字`);
  console.log(`[单五行] 跳过统计 - 方案A(中间字: ${skipCountA1}, 结尾字: ${skipCountA2}), 方案B(中间字: ${skipCountB1}, 结尾字: ${skipCountB2})`);
  
  return results;
};

/**
 * 不限五行模式：使用所有字符
 */
const generateUnrestrictedNames = async (
  surname: string,
  tonePattern: string,
  tonePatternDesc: string | undefined,
  count: number,
  used: Set<string>,
  MAX_REUSE: number
): Promise<NameResult[]> => {
  const results: NameResult[] = [];
  const allChars = [...getAllWuxingCharacters(), ...getMiddleCharacters(), ...getEndingCharacters()];

  for (let i = 0; i < allChars.length; i++) {
    const char1 = allChars[i];

    for (let j = 0; j < allChars.length; j++) {
      if (i === j) continue;

      const char2 = allChars[j];
      
      // 【关键修复】每条组合都重新查询最新计数
      const char1Count = await namingDB.getCharCount(char1.char, 'first');
      if (char1Count >= MAX_REUSE) {
        break;  // 中间字达到限制，跳出内层循环
      }
      
      const char2Count = await namingDB.getCharCount(char2.char, 'second');
      if (char2Count >= MAX_REUSE) {
        continue;  // 尾部字达到限制，跳过
      }

      const nameKey = char1.char + char2.char;
      if (used.has(nameKey)) continue;

      if (!checkTonePattern(char1, char2, tonePattern)) continue;

      if (tonePatternDesc) {
        const descTones = parseToneDescription(tonePatternDesc);
        if (descTones && !matchToneDescription([char1.tone, char2.tone], descTones)) {
          continue;
        }
      }

      used.add(nameKey);
      
      // 更新数据库中的计数
      await namingDB.incrementMultipleChars([
        { char: char1.char, position: 'first' },
        { char: char2.char, position: 'second' }
      ]);

      const auspiciousRefs = collectAuspiciousPhrases(char1, char2);

      results.push({
        fullName: surname + char1.char + char2.char,
        firstName: char1.char,
        secondName: char2.char,
        firstChar: char1,
        secondChar: char2,
        tones: [char1.tone, char2.tone],
        tonePattern: getToneType(char1.tone) + getToneType(char2.tone),
        wuxing: [char1.wuxing, char2.wuxing],
        auspiciousReferences: auspiciousRefs,
        nameStructure: '自由组合'
      });

      if (results.length >= count) {
        return results;
      }
    }
  }

  return results;
};

// 收集吉祥参考
const collectAuspiciousPhrases = (char1: Character, char2: Character): string[] => {
  const phrases = [
    ...(char1.auspicious_phrases || []).slice(0, 2),
    ...(char2.auspicious_phrases || []).slice(0, 2)
  ];
  return [...new Set(phrases)].slice(0, 4);
};

// 解析平仄描述
const parseToneDescription = (desc: string): string[] | null => {
  const mapping: Record<string, string> = {
    '平': 'ping',
    '仄': 'ze'
  };

  const chars = desc.split('').filter(c => c === '平' || c === '仄');
  if (chars.length === 0) return null;

  return chars.map(c => mapping[c]);
};

// 匹配平仄描述
const matchToneDescription = (tones: number[], expected: string[]): boolean => {
  if (tones.length !== expected.length) return false;

  for (let i = 0; i < tones.length; i++) {
    const actual = getToneType(tones[i]);
    if (actual !== expected[i]) return false;
  }

  return true;
};

// 获取五行选项
export const getWuxingOptions = (): string[] => {
  return ['金', '木', '水', '火', '土'];
};

// 获取平仄模式
export const getTonePatterns = () => {
  return [
    { value: 'any', label: '不限', desc: '任意平仄组合' },
    { value: 'pingping', label: '平平', desc: '两个字都是平声（1、2声）' },
    { value: 'pingze', label: '平仄', desc: '第一个字平声，第二个字仄声' },
    { value: 'zep ing', label: '仄平', desc: '第一个字仄声，第二个字平声' },
    { value: 'zeze', label: '仄仄', desc: '两个字都是仄声（3、4声）' }
  ];
};

/**
 * 谐音匹配函数：检查名字是否匹配吉祥词组的谐音映射
 */
export interface MatchedPhrase {
  phrase: string;
  type: string;
  source: string;
  meaning: string;
  mapping: Record<string, string>;
}

export const matchHomophone = (firstName: string, secondName: string): MatchedPhrase[] => {
  const matched: MatchedPhrase[] = [];
  const nameCombination = firstName + secondName;
  
  for (const item of auspiciousPhrases) {
    if (!item.homophone_mappings) continue;
    
    for (const mapping of item.homophone_mappings) {
      if (mapping.name === nameCombination) {
        matched.push({
          phrase: item.phrase,
          type: item.type,
          source: item.source,
          meaning: item.meaning,
          mapping: mapping.mapping
        });
      }
    }
  }
  
  return matched;
};

/**
 * 计算名字的综合评分（用于排序）
 */
export const calculateScore = (result: NameResult): number => {
  let score = 0;
  
  // 1. 谐音匹配加分（最高50分）
  const matches = matchHomophone(result.firstName, result.secondName);
  if (matches.length > 0) {
    score += Math.min(matches.length * 20, 50);
  }
  
  // 2. 常用字加分（避免生僻字，最高20分）
  const commonChars = new Set(['子', '文', '武', '明', '德', '志', '远', '浩', '然', '轩', 
                               '博', '雅', '静', '怡', '欣', '悦', '嘉', '瑞', '祥', '福']);
  if (commonChars.has(result.firstChar.char)) score += 5;
  if (commonChars.has(result.secondChar.char)) score += 5;
  
  // 3. 笔画数合理性（适中为佳，最高10分）
  const totalStrokes = result.firstChar.simplified_strokes + result.secondChar.simplified_strokes;
  if (totalStrokes >= 15 && totalStrokes <= 30) score += 10;
  else if (totalStrokes >= 10 && totalStrokes <= 40) score += 5;
  
  // 4. 平仄和谐加分（最高10分）
  if (result.tonePattern === 'pingze' || result.tonePattern === 'zep ing') score += 10;
  else if (result.tonePattern === 'pingping' || result.tonePattern === 'zeze') score += 5;
  
  return score;
};

/**
 * 对生成的名字进行智能排序
 */
export const sortNamesByQuality = (results: NameResult[]): NameResult[] => {
  return results.sort((a, b) => {
    const scoreA = calculateScore(a);
    const scoreB = calculateScore(b);
    return scoreB - scoreA; // 降序排列，高分在前
  });
};
