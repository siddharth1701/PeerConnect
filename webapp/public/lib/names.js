/**
 * Random name generator using Naruto character names
 * Provides instant, unique names without user input
 */

const NARUTO_NAMES = [
  'Naruto', 'Sasuke', 'Sakura', 'Kakashi', 'Itachi',
  'Madara', 'Obito', 'Minato', 'Kushina', 'Jiraiya',
  'Orochimaru', 'Tsunade', 'Hiruzen', 'Tobirama', 'Hashirama',
  'Neji', 'Hinata', 'Shikamaru', 'Temari', 'Gaara',
  'Rock Lee', 'Tenten', 'Ino', 'Choji', 'Kiba',
  'Shino', 'Hanabi', 'Boruto', 'Sarada', 'Mitsuki',
  'Jigen', 'Kawaki', 'Code', 'Eida', 'Daemon',
  'Narutaki', 'Isshiki', 'Kaguya', 'Ashura', 'Indra',
  'Hagoromo', 'Black Zetsu', 'White Zetsu', 'Kisame', 'Itachi',
  'Konan', 'Nagato', 'Yahiko', 'Deidara', 'Sasori',
  'Hidan', 'Kakuzu', 'Zetsu', 'Tobi', 'Pain',
  'Kurenai', 'Asuma', 'Might Guy', 'Anko', 'Hayate',
  'Ibiki', 'Gekko Hayate', 'Raido', 'Aoba', 'Shizune',
  'Raidou', 'Genma', 'Zabuza', 'Haku', 'Jugo',
  'Karin', 'Suigetsu', 'Orochimaru\'s Clone', 'Yamato', 'Sai',
  'Tayuya', 'Kidoumaru', 'Sakon', 'Ukon', 'Kidomaru'
];

export function getRandomName() {
  const randomIndex = Math.floor(Math.random() * NARUTO_NAMES.length);
  return NARUTO_NAMES[randomIndex];
}

export function getRandomNameWithId() {
  const name = getRandomName();
  const id = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${name}#${id}`;
}
