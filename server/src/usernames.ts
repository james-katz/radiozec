// ~40% crypto/Zcash themed, ~60% generic fun names
// Keeps it fresh without being exhausting

const cryptoAdjectives = [
  'Shielded', 'Private', 'Encrypted', 'Anonymous', 'Decentralized',
  'Trustless', 'Verified', 'Hashed', 'Minted', 'Staked',
  'Synced', 'Forked', 'Merged', 'Pruned', 'Bonded',
];

const cryptoNouns = [
  'Zebra', 'Sprout', 'Sapling', 'Orchard', 'Miner',
  'Validator', 'Node', 'Block', 'Ledger', 'Witness',
  'Proof', 'Nullifier', 'Anchor', 'Commitment', 'Circuit',
  'Ironwood', 'Turnstile', 'Zcashier', 'Zoolander', 'Zeppelin',
];

const genericAdjectives = [
  'Cosmic', 'Neon', 'Turbo', 'Pixel', 'Quantum',
  'Hyper', 'Mega', 'Ultra', 'Retro', 'Stellar',
  'Mystic', 'Electric', 'Blazing', 'Frozen', 'Golden',
  'Swift', 'Silent', 'Vivid', 'Calm', 'Bold',
  'Lucky', 'Rusty', 'Fuzzy', 'Dizzy', 'Crispy',
  'Bouncy', 'Speedy', 'Sneaky', 'Witty', 'Groovy',
];

const genericNouns = [
  'Penguin', 'Phoenix', 'Ninja', 'Panda', 'Voyager',
  'Wizard', 'Pirate', 'Robot', 'Dragon', 'Falcon',
  'Cactus', 'Toaster', 'Rocket', 'Dolphin', 'Koala',
  'Waffle', 'Nebula', 'Parrot', 'Turtle', 'Llama',
  'Mango', 'Bonsai', 'Otter', 'Raven', 'Tiger',
  'Sloth', 'Badger', 'Pickle', 'Squid', 'Yeti',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random username.
 * ~40% chance of a crypto-themed name, ~60% generic.
 * Appends a 2-digit number for uniqueness.
 */
export function generateUsername(): string {
  const useCrypto = Math.random() < 0.4;
  const adj = useCrypto ? pick(cryptoAdjectives) : pick(genericAdjectives);
  const noun = useCrypto ? pick(cryptoNouns) : pick(genericNouns);
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}
