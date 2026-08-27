import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { config } from './config';
import path from 'path';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'zecradio.db'),
  logging: false,
});

// ── Donation ──────────────────────────────────────────────
interface DonationAttributes {
  id: number;
  txid: string;
  value: number;
  memo: string;
  youtubeUrl: string | null;
  action: 'queue' | 'skip' | 'unknown';
  createdAt?: Date;
}

interface DonationCreation extends Optional<DonationAttributes, 'id'> {}

export class Donation extends Model<DonationAttributes, DonationCreation> implements DonationAttributes {
  declare id: number;
  declare txid: string;
  declare value: number;
  declare memo: string;
  declare youtubeUrl: string | null;
  declare action: 'queue' | 'skip' | 'unknown';
  declare createdAt: Date;
}

Donation.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    txid: { type: DataTypes.STRING, allowNull: false, unique: true },
    value: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    memo: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    youtubeUrl: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false, defaultValue: 'unknown' },
  },
  { sequelize, modelName: 'donation', timestamps: true, updatedAt: false }
);

// ── Video ─────────────────────────────────────────────────
interface VideoAttributes {
  id: number;
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: number;
  donationId: number | null;
  playedAt: Date | null;
  skipped: boolean;
}

interface VideoCreation extends Optional<VideoAttributes, 'id'> {}

export class Video extends Model<VideoAttributes, VideoCreation> implements VideoAttributes {
  declare id: number;
  declare youtubeId: string;
  declare title: string;
  declare thumbnail: string;
  declare duration: number;
  declare donationId: number | null;
  declare playedAt: Date | null;
  declare skipped: boolean;
}

Video.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    youtubeId: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    thumbnail: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    donationId: { type: DataTypes.INTEGER, allowNull: true },
    playedAt: { type: DataTypes.DATE, allowNull: true },
    skipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: 'video', timestamps: true }
);

Donation.hasOne(Video, { foreignKey: 'donationId' });
Video.belongsTo(Donation, { foreignKey: 'donationId' });

// ── Config ────────────────────────────────────────────────
interface ConfigAttributes {
  key: string;
  value: string;
}

export class Config extends Model<ConfigAttributes> implements ConfigAttributes {
  declare key: string;
  declare value: string;
}

Config.init(
  {
    key: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    value: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  },
  { sequelize, modelName: 'config', timestamps: false }
);

// ── User (admin only) ────────────────────────────────────
interface UserAttributes {
  id: number;
  username: string;
  password: string;
}

interface UserCreation extends Optional<UserAttributes, 'id'> {}

export class User extends Model<UserAttributes, UserCreation> implements UserAttributes {
  declare id: number;
  declare username: string;
  declare password: string;
}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, modelName: 'user', timestamps: true }
);

// ── Runtime config helpers ────────────────────────────────
export async function getRuntimeConfig(key: string, fallback: string): Promise<string> {
  const row = await Config.findByPk(key);
  return row?.value ?? fallback;
}

export async function setRuntimeConfig(key: string, value: string): Promise<void> {
  await Config.upsert({ key, value });
}

export async function getQueuePrice(): Promise<number> {
  return parseFloat(await getRuntimeConfig('queueVideoPrice', String(config.queueVideoPrice)));
}

export async function getSkipPrice(): Promise<number> {
  return parseFloat(await getRuntimeConfig('skipVideoPrice', String(config.skipVideoPrice)));
}

// ── Initialize DB ─────────────────────────────────────────
export async function initializeDatabase(): Promise<void> {
  await sequelize.sync();

  // Seed admin user if none exists
  const userCount = await User.count();
  if (userCount === 0) {
    await User.create({
      username: config.seedUsername,
      password: config.seedPassword,
    });
    console.log(`[DB] Seeded admin user: ${config.seedUsername}`);
  }

  // Seed default config values
  const defaults: Record<string, string> = {
    queueVideoPrice: String(config.queueVideoPrice),
    skipVideoPrice: String(config.skipVideoPrice),
    donationsEnabled: 'false',
  };
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await Config.findByPk(key);
    if (!existing) {
      await Config.create({ key, value });
    }
  }

  console.log('[DB] Database initialized.');
}

export { sequelize };
