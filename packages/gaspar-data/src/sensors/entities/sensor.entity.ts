import { Room, SensorType } from '@repo/types';

export class Sensor {
  declare id: string;
  declare name: string;
  declare type: SensorType;
  declare room: Room | null;
  declare isActive: boolean;
  declare activeSince: string | null;
  declare updatedAt: string;
  declare createdAt: string;
}
